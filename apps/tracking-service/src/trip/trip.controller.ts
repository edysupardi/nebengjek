import { Roles, UserRole } from '@app/common';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { EndTripDto } from '@app/trip/dto/end-trip.dto';
import { StartTripDto } from '@app/trip/dto/start-trip.dto';
import { UpdateTripLocationDto } from '@app/trip/dto/update-trip-location.dto';
import { TripService } from '@app/trip/trip.service';
import { Body, Controller, Get, Logger, Param, Post, Put, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller('trips')
@UseGuards(TrustedGatewayGuard)
export class TripController {
  private readonly logger = new Logger(TripController.name);
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly tripService: TripService) {}

  @Post('start')
  @Roles(UserRole.DRIVER)
  async startTrip(@CurrentUser() user: any, @Body() startTripDto: StartTripDto) {
    this.logger.log(`Driver ${user.userId} is starting trip for booking ${startTripDto.bookingId}`);
    return this.tripService.startTrip(user.userId, startTripDto);
  }

  // Driver ends trip - triggers everything (booking completion, payment, etc.)
  @Put(':tripId/end')
  @Roles(UserRole.DRIVER)
  async endTrip(@CurrentUser() user: any, @Param('tripId') tripId: string, @Body() endTripDto: EndTripDto) {
    this.logger.log(`Driver ${user.userId} is ending trip ${tripId}`);
    return this.tripService.endTrip(tripId, user.userId, endTripDto);
  }

  @Put(':tripId/location')
  @Roles(UserRole.DRIVER)
  async updateTripLocation(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() updateLocationDto: UpdateTripLocationDto,
  ) {
    this.logger.log(`HTTP location update: Trip ${tripId} by driver ${user.userId}`);

    // Use service method with HTTP source indication
    return this.tripService.updateTripLocation(tripId, user.userId, updateLocationDto, {
      source: 'http',
      isAutoUpdate: false,
      skipWebSocketBroadcast: false, // Still broadcast to WebSocket clients
    });
  }

  // Get trip details (ongoing or completed)
  @Get(':tripId')
  async getTripDetails(@Param('tripId') tripId: string) {
    this.logger.log(`Fetching details for trip ID ${tripId}`);
    return this.tripService.getTripDetails(tripId);
  }

  // Calculate current/final trip cost
  // @Get(':tripId/calculate-cost')
  // async calculateTripCost(@Param('tripId') tripId: string) {
  //   this.logger.log(`Calculating cost for trip ID ${tripId}`);
  //   return this.tripService.calculateTripCost(tripId);
  // }

  // Get all trips for a user (as driver or customer)
  // @Get('user/:userId/trips')
  // async getUserTrips(@Param('userId') userId: string) {
  //   this.logger.log(`Fetching trips for user ID ${userId}`);
  //   return this.tripService.getUserTrips(userId);
  // }

  // Get all currently active trips (admin/monitoring)
  @Get('active')
  async getActiveTrips() {
    this.logger.log('Fetching active trips');
    return this.tripService.getActiveTrips();
  }

  // Recover incomplete/abandoned trips (admin/cron job)
  @Post('recover-incomplete')
  async recoverIncompleteTrips() {
    this.logger.log('Recovering incomplete trips');
    return this.tripService.recoverIncompleteTrips();
  }

  @MessagePattern('getDriverTripStats')
  async getDriverTripStats(data: { driverId: string; daysBack?: number }) {
    try {
      this.logger.log(`[TCP] Getting trip stats for driver ${data.driverId}`);

      const stats = await this.tripService.getDriverTripStatistics(data.driverId, data.daysBack || 30);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      this.logger.error(`[TCP] Error getting driver trip stats: ${errorMessage}`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: null,
      };
    }
  }

  @MessagePattern('getDriverActiveTrip')
  async getDriverActiveTrip(data: { driverId: string }) {
    try {
      this.logger.log(`[TCP] Getting active trip for driver ${data.driverId}`);

      const activeTrip = await this.tripService.getDriverActiveTrip(data.driverId);

      return {
        success: true,
        data: activeTrip,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      this.logger.error(`[TCP] Error getting driver active trip: ${errorMessage}`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: null,
      };
    }
  }

  // **NEW: Start auto location updates via HTTP (fallback)**
  @Post(':tripId/auto-location/start')
  @Roles(UserRole.DRIVER)
  async startAutoLocationUpdates(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() data: { intervalMs?: number } = {},
  ) {
    try {
      this.logger.log(`HTTP request to start auto location for trip ${tripId}`);

      const gateway = this.tripService.getTripGateway();

      // You'd need to implement a method in gateway to start auto updates programmatically
      // This is a fallback for when WebSocket isn't available

      return {
        success: true,
        message: 'Auto location updates should be started via WebSocket connection',
        tripId,
        intervalMs: data.intervalMs || 10000,
        websocketEndpoint: `ws://localhost:${process.env.TRACKING_WS_PORT || 3060}`,
        instructions: [
          '1. Connect to WebSocket',
          '2. Register with: trip.user.register',
          '3. Start auto updates with: trip.start_auto_location',
        ],
      };
    } catch (error) {
      this.logger.error('Error starting auto location via HTTP:', error);
      throw error;
    }
  }

  // **NEW: Stop auto location updates via HTTP (fallback)**
  @Post(':tripId/auto-location/stop')
  @Roles(UserRole.DRIVER)
  async stopAutoLocationUpdates(@CurrentUser() user: any, @Param('tripId') tripId: string) {
    try {
      this.logger.log(`HTTP request to stop auto location for trip ${tripId}`);

      return {
        success: true,
        message: 'Auto location updates should be stopped via WebSocket connection',
        tripId,
        websocketEndpoint: `ws://localhost:${process.env.TRACKING_WS_PORT || 3060}`,
        instructions: ['Send: trip.stop_auto_location with tripId'],
      };
    } catch (error) {
      this.logger.error('Error stopping auto location via HTTP:', error);
      throw error;
    }
  }

  // **NEW: Get current auto-update status**
  @Get(':tripId/auto-location/status')
  async getAutoLocationStatus(@Param('tripId') tripId: string) {
    try {
      this.logger.log(`Getting auto location status for trip ${tripId}`);

      const gateway = this.tripService.getTripGateway();
      const activeSessions = gateway.getActiveAutoUpdateSessions();
      const tripSession = activeSessions.find(session => session.tripId === tripId);

      return {
        tripId,
        isActive: !!tripSession,
        session: tripSession || null,
        connectionStats: gateway.getConnectionStats(),
        websocketEndpoint: `ws://localhost:${process.env.TRACKING_WS_PORT || 3060}`,
      };
    } catch (error) {
      this.logger.error('Error getting auto location status:', error);
      throw error;
    }
  }

  // **NEW: Manual trigger for earnings calculation**
  @Post(':tripId/calculate-earnings')
  @Roles(UserRole.DRIVER)
  async triggerEarningsCalculation(@CurrentUser() user: any, @Param('tripId') tripId: string) {
    try {
      this.logger.log(`Manual earnings calculation for trip ${tripId}`);

      const costData = await this.tripService.calculateTripCost(tripId);

      return {
        success: true,
        tripId,
        earnings: costData,
        timestamp: new Date(),
        note: 'Manual calculation triggered - real-time updates happen automatically',
      };
    } catch (error) {
      this.logger.error('Error calculating earnings:', error);
      throw error;
    }
  }
}
