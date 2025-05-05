import { Controller, Post, Put, Body, Request, UseGuards, Logger } from "@nestjs/common";
import { UserRole } from '@prisma/client';
import { Roles } from '@app/common/decorators/roles.decorator';
import { DriverService } from '@app/driver/driver.service';
import { RegisterDriverDto } from '@app/driver/dto/register-driver.dto';
import { UpdateDriverStatusDto } from '@app/driver/dto/update-driver-status.dto';
import { UpdateLocationDto } from '@app/driver/dto/update-location.dto';
import { JwtAuthGuard } from "@app/common/guards/jwt-auth.guard";

@Controller('driver')
@UseGuards(JwtAuthGuard)
export class DriverController {
  private readonly logger = new Logger(DriverController.name);
  constructor(private readonly driverService: DriverService) {}

  @Post('register')
  @Roles(UserRole.CUSTOMER)
  async registerAsDriver(@Request() req: any, @Body() driverDto: RegisterDriverDto) {
    this.logger.log(`Registering user ID: ${req.user.userId} as driver`);
    return this.driverService.registerAsDriver(req.user.userId, driverDto);
  }

  @Put('status')
  @Roles(UserRole.DRIVER)
  async updateStatus(@Request() req: any, @Body() statusDto: UpdateDriverStatusDto) {
    this.logger.log(`Updating status for user ID: ${req.user.userId} to ${statusDto.status}`);
    return this.driverService.updateStatus(req.user.userId, statusDto.status);
  }

  // Memperbarui "last known location" di profil driver
  @Put('location')
  @Roles(UserRole.DRIVER)
  async updateLocation(@Request() req: any, @Body() locationDto: UpdateLocationDto) {
    this.logger.log(`Updating location for user ID: ${req.user.userId} to ${JSON.stringify(locationDto)}`);
    return this.driverService.updateLocation(req.user.userId, locationDto);
  }
}