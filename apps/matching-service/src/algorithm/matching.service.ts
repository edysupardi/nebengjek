import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/database/prisma/prisma.service';
import { RedisService } from '@app/database/redis/redis.service';
import { FindMatchDto } from './dto/find-match.dto';
import { MatchResponseDto, DriverMatchDto } from './dto/match-response.dto';
import { DistanceHelper } from './distance.helper';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: any,
  ) { }

  /**
   * Mencari driver terdekat untuk customer
   * @param findMatchDto DTO dengan koordinat customer dan radius pencarian
   * @returns Driver-driver terdekat dalam radius pencarian
   */
  async findDrivers(findMatchDto: FindMatchDto): Promise<MatchResponseDto> {
    const { customerId, latitude, longitude, radius, excludeDrivers, preferredDrivers, bookingId } = findMatchDto;

    try {
      // 1. Get customer preferences and blocked drivers (if customerId provided)
      let customerPreferences = null;
      let blockedDrivers: string[] = [];
      let customerHistory: any[] = [];
      let allExcludedDrivers: string[] = [];

      if (customerId) {
        this.logger.log(`Finding drivers for customer ${customerId}`);

        // Get customer data and preferences
        customerPreferences = await this.getCustomerPreferences(customerId);

        // Get blocked/rejected drivers for this customer
        blockedDrivers = await this.getBlockedDrivers(customerId);

        // Get customer's recent trip history for smart matching
        customerHistory = await this.getCustomerTripHistory(customerId);

        this.logger.log(`Customer preferences: ${JSON.stringify(customerPreferences)}`);
        this.logger.log(`Blocked drivers count: ${blockedDrivers.length}`);
      }

      // 2. Combine all excluded drivers (customer blocked + manually excluded + booking-specific)
      allExcludedDrivers = [
        ...blockedDrivers,
        ...(excludeDrivers || [])
      ];

      // Add booking-specific excluded drivers from Redis (drivers who already rejected this booking)
      if (bookingId) {
        const bookingRejectedDrivers = await this.getBookingRejectedDrivers(bookingId);
        allExcludedDrivers.push(...bookingRejectedDrivers);
        this.logger.log(`Booking ${bookingId} rejected drivers: ${bookingRejectedDrivers.length}`);
      }

      // Remove duplicates
      allExcludedDrivers = [...new Set(allExcludedDrivers)];

      if (allExcludedDrivers.length > 0) {
        this.logger.log(`Total excluded drivers: ${allExcludedDrivers.length}`);
      }

      // 2. Get online drivers from database
      const onlineDrivers = await this.prisma.driverProfile.findMany({
        where: {
          status: true, // hanya driver yang online
          lastLatitude: { not: null },
          lastLongitude: { not: null },
          // Exclude all blocked/rejected drivers
          ...(allExcludedDrivers.length > 0 && {
            userId: {
              notIn: allExcludedDrivers
            }
          })
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true
            }
          }
        }
      });

      // Jika tidak ada driver online
      if (onlineDrivers.length === 0) {
        this.logger.warn('Tidak ada driver yang tersedia saat ini');
        return {
          success: false,
          message: 'Tidak ada driver yang tersedia saat ini',
          data: []
        };
      } else {
        this.logger.log(`Ditemukan ${onlineDrivers.length} driver online`);
      }

      this.logger.log(`Mencari driver dalam radius ${radius} km dari (${latitude}, ${longitude})`);

      // 3. Filter driver berdasarkan jarak
      const nearbyDrivers = DistanceHelper.filterByDistance(
        onlineDrivers,
        latitude,
        longitude,
        radius
      );

      // 4. Apply customer-specific filtering and sorting
      let filteredDrivers = nearbyDrivers;

      // Apply preferred drivers first (if specified)
      if (preferredDrivers && preferredDrivers.length > 0) {
        filteredDrivers = this.applyPreferredDrivers(nearbyDrivers, preferredDrivers);
      }

      if (customerId && customerPreferences) {
        filteredDrivers = this.applyCustomerPreferences(filteredDrivers, customerPreferences);
      }

      // 5. Smart sorting based on customer history
      if (customerId && customerHistory.length > 0) {
        filteredDrivers = this.applySmarSorting(filteredDrivers, customerHistory);
      }

      // 6. Format data untuk response
      const formattedDrivers: DriverMatchDto[] = filteredDrivers.map(driver => {
        const baseDriver: DriverMatchDto = {
          id: driver.id,
          userId: driver.userId,
          name: driver.user.name,
          phone: driver.user.phone,
          lastLatitude: driver.lastLatitude,
          lastLongitude: driver.lastLongitude,
          distance: Number(driver.distance.toFixed(2)),
          vehicleType: driver.vehicleType,
          plateNumber: driver.plateNumber,
          rating: driver.rating
        };

        // Add customer-specific info if applicable
        if (customerId) {
          baseDriver.isPreferred = this.isPreferredDriver(driver.userId, customerHistory);
          baseDriver.previousTripCount = this.getPreviousTripCount(driver.userId, customerHistory);
        }

        return baseDriver;
      });

      // 7. Cache the search result for this customer (if customerId provided)
      if (customerId && formattedDrivers.length > 0) {
        await this.cacheDriverSearchResult(customerId, formattedDrivers);
      }

      return {
        success: true,
        message: `Berhasil menemukan ${formattedDrivers.length} driver terdekat`,
        data: formattedDrivers
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error saat mencari driver: ${errorMessage}`, error);
      return {
        success: false,
        message: 'Terjadi kesalahan saat mencari driver',
        data: []
      };
    }
  }

  /**
   * Get customer preferences (vehicle type, rating threshold, etc.)
   */
  private async getCustomerPreferences(customerId: string) {
    try {
      // Check if customer has specific preferences stored
      const cachedPrefs = await this.redis.get(`customer:${customerId}:preferences`);
      if (cachedPrefs) {
        return JSON.parse(cachedPrefs);
      }

      // Get from database or use defaults
      const customer = await this.prisma.user.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          // Add customer preference fields if they exist in your schema
        }
      });

      // Default preferences
      const defaultPreferences = {
        preferredVehicleTypes: ['motorcycle', 'car'], // Accept both
        minRating: 3.0,
        maxDistance: 5, // km
        prioritizePreviousDrivers: true
      };

      // Cache preferences for 1 hour
      await this.redis.set(
        `customer:${customerId}:preferences`,
        JSON.stringify(defaultPreferences),
        'EX',
        3600
      );

      return defaultPreferences;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting customer preferences: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get drivers blocked/rejected by this customer
   */
  private async getBlockedDrivers(customerId: string): Promise<string[]> {
    try {
      // Get from Redis cache first
      const cachedBlocked = await this.redis.smembers(`customer:${customerId}:blocked-drivers`);
      if (cachedBlocked && cachedBlocked.length > 0) {
        return cachedBlocked;
      }

      // Get from database - drivers who were consistently rejected/cancelled by this customer
      const rejectedBookings = await this.prisma.booking.findMany({
        where: {
          customerId: customerId,
          status: 'CANCELLED',
          driverId: { not: null },
          // Only consider recent cancellations (last 30 days)
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        select: {
          driverId: true
        }
      });

      // Count cancellations per driver
      const cancellationCounts = rejectedBookings.reduce((acc, booking) => {
        if (booking.driverId) {
          acc[booking.driverId] = (acc[booking.driverId] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      // Block drivers with 3+ cancellations
      const blockedDrivers = Object.entries(cancellationCounts)
        .filter(([_, count]) => count >= 3)
        .map(([driverId, _]) => driverId);

      // Cache for 1 hour
      if (blockedDrivers.length > 0) {
        await this.redis.sadd(`customer:${customerId}:blocked-drivers`, ...blockedDrivers);
        await this.redis.expire(`customer:${customerId}:blocked-drivers`, 3600);
      }

      return blockedDrivers;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting blocked drivers: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Get customer's trip history for smart matching
   */
  private async getCustomerTripHistory(customerId: string) {
    try {
      // Get completed trips from last 90 days
      const tripHistory = await this.prisma.booking.findMany({
        where: {
          customerId: customerId,
          status: 'COMPLETED',
          driverId: { not: null },
          createdAt: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          }
        },
        select: {
          id: true,
          driverId: true,
          createdAt: true,
          // Add rating field if exists
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 50 // Last 50 trips
      });

      return tripHistory;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting customer trip history: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Apply customer preferences to filter drivers
   */
  private applyCustomerPreferences(drivers: any[], preferences: any) {
    if (!preferences) return drivers;

    return drivers.filter(driver => {
      // Filter by vehicle type preference
      if (preferences.preferredVehicleTypes &&
        !preferences.preferredVehicleTypes.includes(driver.vehicleType)) {
        return false;
      }

      // Filter by minimum rating
      if (preferences.minRating && driver.rating < preferences.minRating) {
        return false;
      }

      // Filter by maximum distance
      if (preferences.maxDistance && driver.distance > preferences.maxDistance) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply smart sorting based on customer history
   */
  private applySmarSorting(drivers: any[], customerHistory: any[]) {
    // Create driver frequency map
    const driverFrequency = customerHistory.reduce((acc, trip) => {
      if (trip.driverId) {
        acc[trip.driverId] = (acc[trip.driverId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Sort drivers by: 1) Previous trip count (desc), 2) Rating (desc), 3) Distance (asc)
    return drivers.sort((a, b) => {
      const aTrips = driverFrequency[a.userId] || 0;
      const bTrips = driverFrequency[b.userId] || 0;

      // Prioritize drivers with previous trips
      if (aTrips !== bTrips) {
        return bTrips - aTrips;
      }

      // Then by rating
      if (a.rating !== b.rating) {
        return b.rating - a.rating;
      }

      // Finally by distance
      return a.distance - b.distance;
    });
  }

  /**
   * Check if driver is preferred based on history
   */
  private isPreferredDriver(driverId: string, customerHistory: any[]): boolean {
    const tripCount = customerHistory.filter(trip => trip.driverId === driverId).length;
    return tripCount >= 2; // Preferred if 2+ previous trips
  }

  /**
   * Get previous trip count with this driver
   */
  private getPreviousTripCount(driverId: string, customerHistory: any[]): number {
    return customerHistory.filter(trip => trip.driverId === driverId).length;
  }

  /**
   * Cache driver search result for quick retrieval
   */
  private async cacheDriverSearchResult(customerId: string, drivers: DriverMatchDto[]) {
    try {
      await this.redis.set(
        `customer:${customerId}:last-search`,
        JSON.stringify({
          drivers,
          timestamp: new Date().toISOString()
        }),
        'EX',
        600 // 10 minutes cache
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error caching search result: ${errorMessage}`);
    }
  }

  /**
   * Get drivers who already rejected a specific booking
   */
  private async getBookingRejectedDrivers(bookingId: string): Promise<string[]> {
    try {
      const rejectedDrivers = await this.redis.smembers(`booking:${bookingId}:rejected-drivers`);
      return rejectedDrivers || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting booking rejected drivers: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Add driver to booking rejected list
   */
  async addBookingRejectedDriver(bookingId: string, driverId: string): Promise<void> {
    try {
      await this.redis.sadd(`booking:${bookingId}:rejected-drivers`, driverId);
      // Set expiry for 2 hours (booking timeout)
      await this.redis.expire(`booking:${bookingId}:rejected-drivers`, 7200);
      this.logger.log(`Added driver ${driverId} to rejected list for booking ${bookingId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error adding rejected driver: ${errorMessage}`);
    }
  }

  /**
   * Apply preferred drivers (put them first in the list)
   */
  private applyPreferredDrivers(drivers: any[], preferredDrivers: string[]) {
    const preferred: any[] = [];
    const others: any[] = [];

    drivers.forEach(driver => {
      if (preferredDrivers.includes(driver.userId)) {
        preferred.push(driver);
      } else {
        others.push(driver);
      }
    });

    // Sort preferred by distance, others by existing logic
    preferred.sort((a, b) => a.distance - b.distance);

    return [...preferred, ...others];
  }

  /**
   * Find drivers for re-matching (when original driver rejects)
   */
  async findDriversForReMatch(bookingId: string, findMatchDto: FindMatchDto): Promise<MatchResponseDto> {
    this.logger.log(`Re-matching drivers for booking ${bookingId}`);

    // Add current booking ID to the DTO for proper exclusion
    const enhancedDto = {
      ...findMatchDto,
      bookingId
    };

    return this.findDrivers(enhancedDto);
  }
  async checkDriverAvailability(driverId: string, customerId?: string): Promise<{
    isAvailable: boolean;
    status: string;
    reason?: string;
  }> {
    try {
      // Check basic availability
      const driver = await this.prisma.driverProfile.findUnique({
        where: { userId: driverId },
        select: {
          status: true,
          lastLatitude: true,
          lastLongitude: true
        }
      });

      if (!driver || !driver.status) {
        return {
          isAvailable: false,
          status: 'offline',
          reason: 'Driver is offline'
        };
      }

      // Check if driver is currently on a trip
      const activeBooking = await this.prisma.booking.findFirst({
        where: {
          driverId: driverId,
          status: {
            in: ['ACCEPTED', 'ONGOING']
          }
        }
      });

      if (activeBooking) {
        return {
          isAvailable: false,
          status: 'busy',
          reason: 'Driver is on an active trip'
        };
      }

      // Check customer-specific blocks if customerId provided
      if (customerId) {
        const blockedDrivers = await this.getBlockedDrivers(customerId);
        if (blockedDrivers.includes(driverId)) {
          return {
            isAvailable: false,
            status: 'blocked',
            reason: 'Driver is blocked for this customer'
          };
        }
      }

      return {
        isAvailable: true,
        status: 'available'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking driver availability: ${errorMessage}`);
      return {
        isAvailable: false,
        status: 'error',
        reason: 'Error checking availability'
      };
    }
  }
}