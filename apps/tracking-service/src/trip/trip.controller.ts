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

  // Real-time location updates during trip
  @Put(':tripId/location')
  @Roles(UserRole.DRIVER)
  async updateTripLocation(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() updateLocationDto: UpdateTripLocationDto,
  ) {
    // Reduce logging for frequent location updates
    return this.tripService.updateTripLocation(tripId, user.userId, updateLocationDto);
  }

  // Get trip details (ongoing or completed)
  @Get(':tripId')
  async getTripDetails(@Param('tripId') tripId: string) {
    this.logger.log(`Fetching details for trip ID ${tripId}`);
    return this.tripService.getTripDetails(tripId);
  }

  // Calculate current/final trip cost
  @Get(':tripId/calculate-cost')
  async calculateTripCost(@Param('tripId') tripId: string) {
    this.logger.log(`Calculating cost for trip ID ${tripId}`);
    return this.tripService.calculateTripCost(tripId);
  }

  // Get all trips for a user (as driver or customer)
  @Get('user/:userId/trips')
  async getUserTrips(@Param('userId') userId: string) {
    this.logger.log(`Fetching trips for user ID ${userId}`);
    return this.tripService.getUserTrips(userId);
  }

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
}
