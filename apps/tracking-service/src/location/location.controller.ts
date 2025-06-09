import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { GetNearbyDriversDto } from '@app/location/dto/get-nearby-drivers.dto';
import { UpdateLocationDto } from '@app/location/dto/update-location.dto';
import { LocationService } from '@app/location/location.service';
import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller('location')
@UseGuards(TrustedGatewayGuard)
export class LocationController {
  private readonly logger = new Logger(LocationController.name);

  // eslint-disable-next-line no-unused-vars
  constructor(private readonly locationService: LocationService) {}

  // for real tracking location customer/driver
  @Post('update')
  async updateLocation(@CurrentUser() user: any, @Body() updateLocationDto: UpdateLocationDto) {
    this.logger.log(
      `Updating location for user ID: ${user.userId} to lat: ${updateLocationDto.latitude}, long: ${updateLocationDto.longitude}`,
    );
    return this.locationService.updateLocation(user.userId, updateLocationDto.latitude, updateLocationDto.longitude);
  }

  @Post('nearby-drivers')
  @HttpCode(200)
  async getNearbyDrivers(@Body() getNearbyDriversDto: GetNearbyDriversDto) {
    this.logger.log(
      `Getting nearby drivers for lat: ${getNearbyDriversDto.latitude}, long: ${getNearbyDriversDto.longitude}, radius: ${getNearbyDriversDto.radius}`,
    );
    return this.locationService.getNearbyDrivers(
      getNearbyDriversDto.latitude,
      getNearbyDriversDto.longitude,
      getNearbyDriversDto.radius,
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
    @Query('endTime') endTime?: string,
  ) {
    this.logger.log(`Getting location history for user ID: ${userId} from ${startTime} to ${endTime}`);
    return this.locationService.getLocationHistory(userId, startTime, endTime);
  }

  @MessagePattern('getDriverLocationHistory')
  async getDriverLocationHistory(data: { driverId: string; hoursBack?: number }) {
    try {
      this.logger.log(`[TCP] Getting location history for driver ${data.driverId}`);

      const history = await this.locationService.getDriverLocationHistory(data.driverId, data.hoursBack || 24);

      return {
        success: true,
        data: history,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting driver location history:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: [],
      };
    }
  }

  @MessagePattern('getDriverCurrentLocation')
  async getDriverCurrentLocation(data: { driverId: string }) {
    try {
      this.logger.log(`[TCP] Getting current location for driver ${data.driverId}`);

      const location = await this.locationService.getDriverCurrentLocation(data.driverId);

      return {
        success: true,
        data: location,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting driver current location:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: null,
      };
    }
  }
}
