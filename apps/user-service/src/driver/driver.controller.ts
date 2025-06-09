import { Roles } from '@app/common/decorators/roles.decorator';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { DriverService } from '@app/driver/driver.service';
import { RegisterDriverDto } from '@app/driver/dto/register-driver.dto';
import { UpdateDriverStatusDto } from '@app/driver/dto/update-driver-status.dto';
import { UpdateLocationDto } from '@app/driver/dto/update-location.dto';
import { Body, Controller, Logger, Post, Put, Request, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { UserRole } from '@prisma/client';

@Controller('driver')
export class DriverController {
  private readonly logger = new Logger(DriverController.name);

  /* eslint-disable no-unused-vars */
  constructor(private readonly driverService: DriverService) {}

  @UseGuards(TrustedGatewayGuard)
  @Post('register')
  @Roles(UserRole.CUSTOMER)
  async registerAsDriver(@Request() req: any, @Body() driverDto: RegisterDriverDto) {
    this.logger.log(`Registering user ID: ${req.user.userId} as driver`);
    return this.driverService.registerAsDriver(req.user.userId, driverDto);
  }

  @UseGuards(TrustedGatewayGuard)
  @Put('status')
  @Roles(UserRole.DRIVER)
  async updateStatus(@Request() req: any, @Body() statusDto: UpdateDriverStatusDto) {
    this.logger.log(`Updating status for driver ID: ${req.user.userId} to ${statusDto.status}`);
    return this.driverService.updateStatus(req.user.userId, statusDto.status);
  }

  @MessagePattern('driver.updateStatusWebSocket')
  async updateStatusWebSocket(data: {
    userId: string;
    isOnline: boolean;
    latitude?: number;
    longitude?: number;
    timestamp: string;
    source: string;
  }) {
    try {
      this.logger.log(
        `[TCP] Updating driver status via WebSocket: ${data.userId} -> ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`,
      );

      // Call existing updateStatus method with enhanced data
      const statusResult = await this.driverService.updateStatus(
        data.userId,
        data.isOnline,
        data.timestamp,
        data.latitude,
        data.longitude,
      );

      return {
        success: true,
        userId: data.userId,
        isOnline: data.isOnline,
        updatedAt: new Date(),
        message: 'Driver status updated via WebSocket TCP',
      };
    } catch (error) {
      this.logger.error(`[TCP] Failed to update driver status via WebSocket:`, error);
      return {
        success: false,
        userId: data.userId,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error,
      };
    }
  }

  @UseGuards(TrustedGatewayGuard)
  @Put('location')
  @Roles(UserRole.DRIVER)
  async updateLocation(@Request() req: any, @Body() locationDto: UpdateLocationDto) {
    this.logger.log(`Updating location for user ID: ${req.user.userId} to ${JSON.stringify(locationDto)}`);
    return this.driverService.updateLocation(req.user.userId, locationDto);
  }

  @MessagePattern('getOnlineDrivers')
  async getOnlineDrivers(data: { vehicleType: string; excludedIds: string[]; latitude?: number; longitude?: number }) {
    this.logger.log(`[TCP] Getting online drivers: ${data.vehicleType}, excluded: ${data.excludedIds.length}`);

    try {
      const drivers = await this.driverService.findOnlineDriversForMatching(
        data.vehicleType,
        data.excludedIds,
        data.latitude,
        data.longitude,
      );

      return {
        success: true,
        data: drivers,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting online drivers:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: [],
      };
    }
  }

  @MessagePattern('checkDriverAvailability')
  async checkDriverAvailability(data: { driverId: string }) {
    this.logger.log(`[TCP] Checking driver availability: ${data.driverId}`);

    try {
      const availability = await this.driverService.checkSingleDriverAvailability(data.driverId);

      return {
        success: true,
        data: availability,
      };
    } catch (error) {
      this.logger.error('[TCP] Error checking driver availability:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: { isAvailable: false, reason: 'Error checking availability' },
      };
    }
  }

  @MessagePattern('getDriverProfile')
  async getDriverProfile(data: { driverId: string }) {
    this.logger.log(`[TCP] Getting driver profile: ${data.driverId}`);

    try {
      const profile = await this.driverService.getDriverProfileForMatching(data.driverId);

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      this.logger.error('[TCP] Error getting driver profile:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        data: null,
      };
    }
  }
}
