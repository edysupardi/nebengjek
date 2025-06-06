import { Controller, Post, Body, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { FindMatchDto } from './dto/find-match.dto';
import { MatchResponseDto } from './dto/match-response.dto';
import { MessagePattern, EventPattern } from '@nestjs/microservices';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';

@Controller('matching')
export class MatchingController {
  private readonly logger = new Logger(MatchingController.name);
  constructor(private readonly matchingService: MatchingService) {}

  // ===== EXISTING HTTP ENDPOINTS =====
  @Post('find')
  @UseGuards(TrustedGatewayGuard)
  async findMatch(@Body() findMatchDto: FindMatchDto): Promise<MatchResponseDto> {
    this.logger.log(
      `Finding match for customer ID: ${findMatchDto.customerId} at (${findMatchDto.latitude}, ${findMatchDto.longitude}) with radius ${findMatchDto.radius} km`,
    );
    return this.matchingService.findDrivers(findMatchDto);
  }

  @Get('drivers/nearby')
  @UseGuards(TrustedGatewayGuard)
  async findNearbyDrivers(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radius') radius: number = 1,
  ): Promise<MatchResponseDto> {
    const findMatchDto: FindMatchDto = {
      customerId: null, // Tidak perlu customerId untuk pencarian umum
      latitude,
      longitude,
      radius,
    };
    this.logger.log(`Finding nearby drivers at (${latitude}, ${longitude}) with radius ${radius} km`);
    return this.matchingService.findDrivers(findMatchDto);
  }

  // ===== EXISTING TCP MESSAGE PATTERN - ENHANCED =====
  @MessagePattern('findDrivers')
  async findDriversRPC(data: any) {
    this.logger.log(`Received findDrivers RPC with data: ${JSON.stringify(data)}`);

    const findMatchDto: FindMatchDto = {
      customerId: data.customerId || null,
      latitude: data.latitude,
      longitude: data.longitude,
      radius: data.radius || 1,
      excludeDrivers: data.excludeDrivers || [],
      preferredDrivers: data.preferredDrivers || [],
      bookingId: data.bookingId || null,
    };

    try {
      const result = await this.matchingService.findDrivers(findMatchDto);

      // Transform response to match booking service expectations
      if (result.success && result.data.length > 0) {
        const transformedDrivers = result.data.map(driver => ({
          driverId: driver.id,
          userId: driver.userId,
          distance: driver.distance,
          name: driver.name,
          phone: driver.phone,
          rating: driver.rating,
          vehicleType: driver.vehicleType,
          plateNumber: driver.plateNumber,
          location: {
            // Use lastLatitude/lastLongitude from DriverMatchDto
            latitude: driver.lastLatitude || data.latitude + (Math.random() - 0.5) * 0.01,
            longitude: driver.lastLongitude || data.longitude + (Math.random() - 0.5) * 0.01,
          },
          estimatedArrival: Math.ceil(driver.distance * 2), // rough estimate: 2 min per km
          // Safely access customer-specific properties
          ...(driver.hasOwnProperty('isPreferred') && { isPreferred: driver.isPreferred }),
          ...(driver.hasOwnProperty('previousTripCount') && { previousTripCount: driver.previousTripCount }),
        }));

        this.logger.log(
          `Found ${transformedDrivers.length} drivers for RPC request (excluded: ${(data.excludeDrivers || []).length})`,
        );

        return {
          success: true,
          drivers: transformedDrivers,
          searchRadius: findMatchDto.radius,
          totalFound: transformedDrivers.length,
          excludedCount: (data.excludeDrivers || []).length,
        };
      }

      // Return empty drivers if no match
      this.logger.warn(`No drivers found for RPC request at (${data.latitude}, ${data.longitude}) after exclusions`);
      return {
        success: true,
        drivers: [],
        searchRadius: findMatchDto.radius,
        totalFound: 0,
        excludedCount: (data.excludeDrivers || []).length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in findDrivers RPC: ${errorMessage}`, error);
      return {
        success: false,
        drivers: [],
        error: errorMessage,
      };
    }
  }

  // ===== NEW TCP MESSAGE PATTERNS =====

  /**
   * TCP Message Pattern: Check driver availability status
   */
  @MessagePattern('checkDriverAvailability')
  async checkDriverAvailability(data: { driverId: string; customerId?: string }) {
    try {
      this.logger.log(`Checking availability for driver ${data.driverId}`);

      // Use existing matching service method
      const availability = await this.matchingService.checkDriverAvailability(data.driverId, data.customerId);

      return {
        success: true,
        ...availability,
      };
    } catch (error) {
      this.logger.error(`Error checking driver availability:`, error);
      return {
        success: false,
        driverId: data.driverId,
        isAvailable: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }

  /**
   * TCP Message Pattern: Match driver to specific booking
   */
  @MessagePattern('matchDriverToBooking')
  async matchDriverToBooking(data: {
    bookingId: string;
    latitude: number;
    longitude: number;
    preferredDrivers?: string[];
    excludeDrivers?: string[];
  }) {
    try {
      this.logger.log(`Matching driver for booking ${data.bookingId}`);

      // Use enhanced findDrivers method with exclusions
      const findMatchDto: FindMatchDto = {
        customerId: null,
        latitude: data.latitude,
        longitude: data.longitude,
        radius: 2, // 2km radius for booking matching
        excludeDrivers: data.excludeDrivers || [],
        preferredDrivers: data.preferredDrivers || [],
        bookingId: data.bookingId,
      };

      const driversResponse = await this.matchingService.findDrivers(findMatchDto);

      if (!driversResponse.success || driversResponse.data.length === 0) {
        this.logger.warn(`No drivers found for booking ${data.bookingId} after exclusions`);
        return {
          success: false,
          message: 'No available drivers found after filtering',
          bookingId: data.bookingId,
          excludedCount: (data.excludeDrivers || []).length,
        };
      }

      // Select best driver (already sorted by the enhanced service)
      const bestDriver = driversResponse.data[0];

      this.logger.log(`Matched driver ${bestDriver.id} to booking ${data.bookingId}`);

      return {
        success: true,
        bookingId: data.bookingId,
        matchedDriver: {
          driverId: bestDriver.id,
          name: bestDriver.name,
          phone: bestDriver.phone,
          rating: bestDriver.rating,
          distance: bestDriver.distance,
          vehicleType: bestDriver.vehicleType,
          plateNumber: bestDriver.plateNumber,
          estimatedArrival: Math.ceil(bestDriver.distance * 2),
          // Safely access customer-specific properties
          ...(bestDriver.hasOwnProperty('isPreferred') && { isPreferred: bestDriver.isPreferred }),
          ...(bestDriver.hasOwnProperty('previousTripCount') && { previousTripCount: bestDriver.previousTripCount }),
        },
        matchedAt: new Date().toISOString(),
        totalCandidates: driversResponse.data.length,
        excludedCount: (data.excludeDrivers || []).length,
      };
    } catch (error) {
      this.logger.error('Error matching driver to booking:', error);
      return {
        success: false,
        bookingId: data.bookingId,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }

  // ===== NEW TCP EVENT PATTERNS =====

  /**
   * TCP Event Pattern: Handle driver location updates
   */
  @EventPattern('driver.location.update')
  async handleDriverLocationUpdate(data: { driverId: string; latitude: number; longitude: number; timestamp: string }) {
    try {
      this.logger.log(`Driver ${data.driverId} location updated: ${data.latitude}, ${data.longitude}`);

      // TODO: Integrate with existing MatchingService to update driver location
      // This would typically update Redis cache for real-time matching
    } catch (error) {
      this.logger.error('Error updating driver location:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle driver status changes
   */
  @EventPattern('driver.status.change')
  async handleDriverStatusChange(data: {
    driverId: string;
    status: 'available' | 'busy' | 'offline';
    bookingId?: string;
  }) {
    try {
      this.logger.log(`Driver ${data.driverId} status changed to ${data.status}`);

      // TODO: Integrate with existing MatchingService to update driver status
    } catch (error) {
      this.logger.error('Error updating driver status:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle booking rejection from driver
   */
  @EventPattern('booking.rejected.by.driver')
  async handleBookingRejected(data: { bookingId: string; driverId: string; reason?: string }) {
    try {
      this.logger.log(`Driver ${data.driverId} rejected booking ${data.bookingId}`);

      // Add driver to booking rejected list
      await this.matchingService.addBookingRejectedDriver(data.bookingId, data.driverId);

      this.logger.log(`Driver ${data.driverId} added to rejected list for booking ${data.bookingId}`);
    } catch (error) {
      this.logger.error('Error handling booking rejection:', error);
    }
  }

  /**
   * TCP Message Pattern: Re-match drivers for booking (after rejection)
   */
  @MessagePattern('rematchDriversForBooking')
  async rematchDriversForBooking(data: {
    bookingId: string;
    latitude: number;
    longitude: number;
    customerId?: string;
    radius?: number;
  }) {
    try {
      this.logger.log(`Re-matching drivers for booking ${data.bookingId}`);

      const findMatchDto: FindMatchDto = {
        customerId: data.customerId || null,
        latitude: data.latitude,
        longitude: data.longitude,
        radius: data.radius || 3, // Slightly larger radius for re-matching
        bookingId: data.bookingId, // This will auto-exclude rejected drivers
      };

      const result = await this.matchingService.findDriversForReMatch(data.bookingId, findMatchDto);

      if (result.success && result.data.length > 0) {
        return {
          success: true,
          bookingId: data.bookingId,
          drivers: result.data.map(driver => ({
            driverId: driver.id,
            distance: driver.distance,
            name: driver.name,
            phone: driver.phone,
            rating: driver.rating,
            vehicleType: driver.vehicleType,
            plateNumber: driver.plateNumber,
            estimatedArrival: Math.ceil(driver.distance * 2),
            // Safely access customer-specific properties
            ...(driver.hasOwnProperty('isPreferred') && { isPreferred: driver.isPreferred }),
            ...(driver.hasOwnProperty('previousTripCount') && { previousTripCount: driver.previousTripCount }),
          })),
          totalFound: result.data.length,
          isReMatch: true,
        };
      }

      return {
        success: false,
        bookingId: data.bookingId,
        message: 'No available drivers for re-matching',
        isReMatch: true,
      };
    } catch (error) {
      this.logger.error('Error re-matching drivers:', error);
      return {
        success: false,
        bookingId: data.bookingId,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        isReMatch: true,
      };
    }
  }
}
