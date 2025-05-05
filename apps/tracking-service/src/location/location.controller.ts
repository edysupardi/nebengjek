import { Controller, Post, Body, Get, Param, UseGuards, Query, Logger, HttpCode } from '@nestjs/common';
import { LocationService } from '@app/location/location.service';
import { UpdateLocationDto } from '@app/location/dto/update-location.dto';
import { GetNearbyDriversDto } from '@app/location/dto/get-nearby-drivers.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  private readonly logger = new Logger(LocationController.name);
  constructor(private readonly locationService: LocationService) {}

  // for update location customer/driver
  @Post('update')
  async updateLocation(
    @CurrentUser() user: any,
    @Body() updateLocationDto: UpdateLocationDto
  ) {
    this.logger.log(`Updating location for user ID: ${user.userId} to lat: ${updateLocationDto.latitude}, long: ${updateLocationDto.longitude}`);
    return this.locationService.updateLocation(
      user.userId,
      updateLocationDto.latitude,
      updateLocationDto.longitude
    );
  }

  @Post('nearby-drivers')
  @HttpCode(200)
  async getNearbyDrivers(@Body() getNearbyDriversDto: GetNearbyDriversDto) {
    this.logger.log(`Getting nearby drivers for lat: ${getNearbyDriversDto.latitude}, long: ${getNearbyDriversDto.longitude}, radius: ${getNearbyDriversDto.radius}`);
    return this.locationService.getNearbyDrivers(
      getNearbyDriversDto.latitude,
      getNearbyDriversDto.longitude,
      getNearbyDriversDto.radius
    );
  }

  // for get location driver
  @Get('user/:userId')
  async getUserLocation(@Param('userId') userId: string) {
    this.logger.log(`Getting location for user ID: ${userId}`);
    return this.locationService.getUserLocation(userId);
  }

  @Get('history/:userId')
  async getLocationHistory(
    @Param('userId') userId: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ) {
    this.logger.log(`Getting location history for user ID: ${userId} from ${startTime} to ${endTime}`);
    return this.locationService.getLocationHistory(userId, startTime, endTime);
  }
}