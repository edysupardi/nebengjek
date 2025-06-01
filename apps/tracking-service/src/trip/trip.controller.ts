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
  constructor(private readonly tripService: TripService) {}

  // for start trip customer/driver
  @Post('start')
  @Roles(UserRole.DRIVER)
  async startTrip(
    @CurrentUser() user: any,
    @Body() startTripDto: StartTripDto
  ) {
    this.logger.log(`Driver ${user.userId} is starting a trip with data: ${JSON.stringify(startTripDto)}`);
    return this.tripService.startTrip(user.userId, startTripDto);
  }

  // for end trip customer/driver
  @Put(':tripId/end')
  @Roles(UserRole.DRIVER)
  async endTrip(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() endTripDto: EndTripDto
  ) {
    this.logger.log(`Driver ${user.userId} is ending trip ${tripId} with data: ${JSON.stringify(endTripDto)}`);
    return this.tripService.endTrip(tripId, user.userId, endTripDto);
  }

  // for update trip location customer/driver realtime and calculate total travel
  @Put(':tripId/location')
  @Roles(UserRole.DRIVER)
  async updateTripLocation(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() updateLocationDto: UpdateTripLocationDto
  ) {
    this.logger.log(`Driver ${user.userId} is updating location for trip ${tripId} with data: ${JSON.stringify(updateLocationDto)}`);
    return this.tripService.updateTripLocation(tripId, user.userId, updateLocationDto);
  }

  // for get trip details customer/driver
  @Get(':tripId')
  async getTripDetails(@Param('tripId') tripId: string) {
    this.logger.log(`Fetching details for trip ID ${tripId}`);
    return this.tripService.getTripDetails(tripId);
  }

  // for calculate trip cost
  @Get(':tripId/calculate-cost')
  async calculateTripCost(@Param('tripId') tripId: string) {
    this.logger.log(`Calculating cost for trip ID ${tripId}`);
    return this.tripService.calculateTripCost(tripId);
  }

  @Get('user/:userId/trips')
  async getUserTrips(@Param('userId') userId: string) {
    this.logger.log(`Fetching trips for user ID ${userId}`);
    return this.tripService.getUserTrips(userId);
  }

  @Get('active')
  async getActiveTrips() {
    this.logger.log('Fetching active trips');
    return this.tripService.getActiveTrips();
  }

  @Post('recover-incomplete')
  async recoverIncompleteTrips() {
    this.logger.log('Recovering incomplete trips');
    return this.tripService.recoverIncompleteTrips();
  }
}