import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { UserRepository } from '@app/user/repositories/user.repository';
import { DriverProfileRepository } from '@app/driver/repositories/driver-profile.repository';
import { RegisterDriverDto } from '@app/driver/dto/register-driver.dto';
import { UpdateLocationDto } from '@app/driver/dto/update-location.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);
  constructor(
    private readonly userRepository: UserRepository,
    private readonly driverProfileRepository: DriverProfileRepository,
    @Inject('REDIS_CLIENT') private redis: any
  ) {}

  async registerAsDriver(userId: string, driverDto: RegisterDriverDto) {
    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.error(`Driver not found for ID: ${userId}`);
      throw new NotFoundException('Driver not found');
    }

    // Check if user is already a driver
    if (user.role === UserRole.DRIVER) {
      this.logger.error(`Driver is already registered as driver: ${userId}`);
      throw new BadRequestException('Driver is already registered as driver');
    }

    // Check if driver profile already exists
    const existingProfile = await this.driverProfileRepository.findByUserId(userId);
    if (existingProfile) {
      this.logger.error(`Driver profile already exists for user ID: ${userId}`);
      throw new BadRequestException('Driver profile already exists');
    }

    // Update user role to DRIVER
    await this.userRepository.update(userId, { role: UserRole.DRIVER });

    // Create driver profile
    const driverProfile = await this.driverProfileRepository.create({
      userId,
      vehicleType: driverDto.vehicleType,
      plateNumber: driverDto.plateNumber,
      status: false, // Initially offline
      rating: 5.0, // Default rating
    });
    this.logger.log(`Driver profile created for user ID: ${userId}`);

    return driverProfile;
  }

  async updateStatus(userId: string, status: boolean) {
    const driverProfile = await this.driverProfileRepository.findByUserId(userId);
    if (!driverProfile) {
      this.logger.error(`Driver profile not found for user ID: ${userId}`);
      throw new NotFoundException('Driver profile not found');
    }

    const updatedProfile = await this.driverProfileRepository.update(driverProfile.id, {
      status
    });

    // Update Redis for real-time tracking
    if (status) {
      await this.redis.set(`driver:active:${userId}`, 'true', 'EX', 3600);
    } else {
      await this.redis.del(`driver:active:${userId}`);
    }
    this.logger.log(`Driver status updated for user ID: ${userId} to ${status}`);

    return updatedProfile;
  }

  async updateLocation(userId: string, locationDto: UpdateLocationDto) {
    const driverProfile = await this.driverProfileRepository.findByUserId(userId);
    if (!driverProfile) {
      this.logger.error(`Driver profile not found for user ID: ${userId}`);
      throw new NotFoundException('Driver profile not found');
    }

    // Update driver profile with last known location
    await this.driverProfileRepository.update(driverProfile.id, {
      lastLatitude: locationDto.latitude,
      lastLongitude: locationDto.longitude,
    });
    this.logger.log(`Driver location updated for user ID: ${userId} to ${JSON.stringify(locationDto)}`);

    // Update Redis for real-time tracking
    await this.redis.set(
      `location:${userId}`,
      JSON.stringify({
        lat: locationDto.latitude,
        lng: locationDto.longitude,
        timestamp: new Date()
      }),
      'EX',
      300 // 5 minutes expiry
    );
    this.logger.log(`Driver location updated in Redis for user ID: ${userId}`);

    return { message: 'Location updated successfully' };
  }
}