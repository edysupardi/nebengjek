import { Controller, Post, Get, Put, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { TripService } from '@app/trip/trip.service';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { StartTripDto } from '@app/trip/dto/start-trip.dto';
import { EndTripDto } from '@app/trip/dto/end-trip.dto';
import { UpdateTripLocationDto } from '@app/trip/dto/update-trip-location.dto';
import { Roles, UserRole } from '@app/common';

@Controller('trips')
@UseGuards(TrustedGatewayGuard)
export class TripController {
  private readonly logger = new Logger(TripController.name);
  constructor(private readonly tripService: TripService) { }

  // ✅ Driver starts physical trip (after pickup)
  @Post('start')
  @Roles(UserRole.DRIVER)
  async startTrip(
    @CurrentUser() user: any,
    @Body() startTripDto: StartTripDto
  ) {
    this.logger.log(`Driver ${user.userId} is starting trip for booking ${startTripDto.bookingId}`);
    return this.tripService.startTrip(user.userId, startTripDto);
  }

  // ✅ Driver ends trip - triggers everything (booking completion, payment, etc.)
  @Put(':tripId/end')
  @Roles(UserRole.DRIVER)
  async endTrip(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() endTripDto: EndTripDto
  ) {
    this.logger.log(`Driver ${user.userId} is ending trip ${tripId}`);
    return this.tripService.endTrip(tripId, user.userId, endTripDto);
  }

  // ✅ Real-time location updates during trip
  @Put(':tripId/location')
  @Roles(UserRole.DRIVER)
  async updateTripLocation(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() updateLocationDto: UpdateTripLocationDto
  ) {
    // Reduce logging for frequent location updates
    return this.tripService.updateTripLocation(tripId, user.userId, updateLocationDto);
  }

  // ✅ Get trip details (ongoing or completed)
  @Get(':tripId')
  async getTripDetails(@Param('tripId') tripId: string) {
    this.logger.log(`Fetching details for trip ID ${tripId}`);
    return this.tripService.getTripDetails(tripId);
  }

  // ✅ Calculate current/final trip cost
  @Get(':tripId/calculate-cost')
  async calculateTripCost(@Param('tripId') tripId: string) {
    this.logger.log(`Calculating cost for trip ID ${tripId}`);
    return this.tripService.calculateTripCost(tripId);
  }

  // ✅ Get all trips for a user (as driver or customer)
  @Get('user/:userId/trips')
  async getUserTrips(@Param('userId') userId: string) {
    this.logger.log(`Fetching trips for user ID ${userId}`);
    return this.tripService.getUserTrips(userId);
  }

  // ✅ Get all currently active trips (admin/monitoring)
  @Get('active')
  async getActiveTrips() {
    this.logger.log('Fetching active trips');
    return this.tripService.getActiveTrips();
  }

  // ✅ Recover incomplete/abandoned trips (admin/cron job)
  @Post('recover-incomplete')
  async recoverIncompleteTrips() {
    this.logger.log('Recovering incomplete trips');
    return this.tripService.recoverIncompleteTrips();
  }
}