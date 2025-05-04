import { Controller, Post, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { TripService } from '@app/trip/trip.service';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { StartTripDto } from '@app/trip/dto/start-trip.dto';
import { EndTripDto } from '@app/trip/dto/end-trip.dto';
import { UpdateTripLocationDto } from '@app/trip/dto/update-trip-location.dto';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripController {
  constructor(private readonly tripService: TripService) {}

  // for start trip customer/driver
  @Post('start')
  async startTrip(
    @CurrentUser() user: any,
    @Body() startTripDto: StartTripDto
  ) {
    return this.tripService.startTrip(user.userId, startTripDto);
  }

  // for end trip customer/driver
  @Put(':tripId/end')
  async endTrip(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() endTripDto: EndTripDto
  ) {
    return this.tripService.endTrip(tripId, user.userId, endTripDto);
  }

  // for update trip location customer/driver realtime
  @Put(':tripId/location')
  async updateTripLocation(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() updateLocationDto: UpdateTripLocationDto
  ) {
    return this.tripService.updateTripLocation(tripId, user.userId, updateLocationDto);
  }

  // for get trip details customer/driver
  @Get(':tripId')
  async getTripDetails(@Param('tripId') tripId: string) {
    return this.tripService.getTripDetails(tripId);
  }

  // for calculate trip cost
  @Get(':tripId/calculate-cost')
  async calculateTripCost(@Param('tripId') tripId: string) {
    return this.tripService.calculateTripCost(tripId);
  }

  @Get('user/:userId/trips')
  async getUserTrips(@Param('userId') userId: string) {
    return this.tripService.getUserTrips(userId);
  }

  @Get('active')
  async getActiveTrips() {
    return this.tripService.getActiveTrips();
  }

  @Post('recover-incomplete')
  async recoverIncompleteTrips() {
    return this.tripService.recoverIncompleteTrips();
  }
}