import { RegisterDriverDto } from '@app/driver/dto/register-driver.dto';
import { UpdateLocationDto } from '@app/driver/dto/update-location.dto';
import { DriverProfileRepository } from '@app/driver/repositories/driver-profile.repository';
import { UserRepository } from '@app/user/repositories/user.repository';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);
  /* eslint-disable no-unused-vars */
  constructor(
    private readonly userRepository: UserRepository,
    private readonly driverProfileRepository: DriverProfileRepository,
    @Inject('REDIS_CLIENT') private redis: any,
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
      status,
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
        timestamp: new Date(),
      }),
      'EX',
      300, // 5 minutes expiry
    );
    this.logger.log(`Driver location updated in Redis for user ID: ${userId}`);

    return { message: 'Location updated successfully' };
  }

  /**
   * Find online drivers for matching service
   */
  async findOnlineDriversForMatching(
    vehicleType: string,
    excludedIds: string[],
    latitude?: number,
    longitude?: number,
  ) {
    try {
      // Use existing driverProfileRepository (check your actual repository name)
      const drivers = await this.driverProfileRepository.findMany({
        where: {
          status: true, // hanya driver yang online
          vehicleType: vehicleType,
          lastLatitude: { not: null },
          lastLongitude: { not: null },
          // Exclude blocked/rejected drivers
          ...(excludedIds.length > 0 && {
            userId: { notIn: excludedIds },
          }),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      });

      // If location provided, calculate distances
      if (latitude && longitude) {
        return drivers.map(driver => ({
          ...driver,
          distance: this.calculateDistance(latitude, longitude, driver.lastLatitude!, driver.lastLongitude!),
        }));
      }

      return drivers;
    } catch (error) {
      this.logger.error('Error finding online drivers for matching:', error);
      throw error;
    }
  }

  /**
   * Check single driver availability
   */
  async checkSingleDriverAvailability(driverId: string) {
    try {
      // Use existing method or repository (adjust to your actual method name)
      const driver = await this.driverProfileRepository.findByUserId(driverId);

      if (!driver) {
        return {
          isAvailable: false,
          status: 'not_found',
          reason: 'Driver not found',
        };
      }

      if (!driver.status) {
        return {
          isAvailable: false,
          status: 'offline',
          reason: 'Driver is offline',
        };
      }

      return {
        isAvailable: true,
        status: 'online',
        lastLocation: {
          latitude: driver.lastLatitude,
          longitude: driver.lastLongitude,
        },
        rating: driver.rating,
        vehicleType: driver.vehicleType,
      };
    } catch (error) {
      this.logger.error('Error checking driver availability:', error);
      throw error;
    }
  }

  /**
   * Get driver profile for matching
   */
  async getDriverProfileForMatching(driverId: string) {
    try {
      return await this.driverProfileRepository.findByUserId(driverId);
    } catch (error) {
      this.logger.error('Error getting driver profile for matching:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
