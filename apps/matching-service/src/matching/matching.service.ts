import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { DistanceHelper } from '../helpers/distance.helper';
import { FindMatchDto } from './dto/find-match.dto';
import { DriverMatchDto, MatchResponseDto } from './dto/match-response.dto';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  /* eslint-disable no-unused-vars */
  constructor(
    @Inject('USER_SERVICE') private userServiceClient: ClientProxy,
    @Inject('TRACKING_SERVICE') private trackingServiceClient: ClientProxy,
    @Inject('BOOKING_SERVICE') private bookingServiceClient: ClientProxy,
    @Inject('REDIS_CLIENT') private redis: any,
  ) {}

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
      allExcludedDrivers = [...blockedDrivers, ...(excludeDrivers || [])];

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

      let onlineDrivers = [];
      try {
        // 2. Get online drivers from user-service
        const onlineDriversResponse = await firstValueFrom(
          this.userServiceClient.send('getOnlineDrivers', {
            vehicleType: 'MOTORCYCLE',
            excludedIds: allExcludedDrivers,
            latitude,
            longitude,
          }),
        );

        if (!onlineDriversResponse.success) {
          this.logger.error(`Failed to get online drivers: ${onlineDriversResponse.message}`);
        } else {
          onlineDrivers = onlineDriversResponse.data;
          this.logger.log(`Found ${onlineDrivers.length} online drivers`);
        }

        // Jika tidak ada driver online
        if (onlineDrivers.length === 0) {
          this.logger.warn('Tidak ada driver yang tersedia saat ini');
          return {
            success: false,
            message: 'Tidak ada driver yang tersedia saat ini',
            data: [],
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to find online drivers: ${String(error)}`, errorMessage);
      }

      const availableDrivers = await this.filterDriversByActiveBooking(onlineDrivers);

      if (availableDrivers.length === 0) {
        this.logger.warn('Semua driver online sedang dalam trip aktif');
        return {
          success: false,
          message: 'Semua driver sedang dalam perjalanan, coba lagi nanti',
          data: [],
        };
      } else if (availableDrivers.length < onlineDrivers.length) {
        this.logger.log(
          `${onlineDrivers.length - availableDrivers.length} driver dikecualikan karena sedang dalam trip aktif`,
        );
      }

      this.logger.log(`Mencari driver dalam radius ${radius} km dari (${latitude}, ${longitude})`);

      // 3. Filter driver berdasarkan jarak
      const nearbyDrivers = DistanceHelper.filterByDistance(availableDrivers, latitude, longitude, radius);

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
          rating: driver.rating,
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
        data: formattedDrivers,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error saat mencari driver: ${errorMessage}`, error);
      return {
        success: false,
        message: 'Terjadi kesalahan saat mencari driver',
        data: [],
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

      // Default preferences
      const defaultPreferences = {
        preferredVehicleTypes: ['motorcycle', 'car'], // Accept both
        minRating: 3.0,
        maxDistance: 5, // km
        prioritizePreviousDrivers: true,
      };

      // Cache preferences for 1 hour
      await this.redis.set(`customer:${customerId}:preferences`, JSON.stringify(defaultPreferences), 'EX', 3600);

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
      // Check Redis cache first
      const cachedBlocked = await this.redis.smembers(`customer:${customerId}:blocked-drivers`);
      if (cachedBlocked && cachedBlocked.length > 0) {
        this.logger.log(`Found ${cachedBlocked.length} cached blocked drivers for customer ${customerId}`);
        return cachedBlocked;
      }

      let cancelledResponse = null;
      try {
        cancelledResponse = await firstValueFrom(
          this.bookingServiceClient.send('getCustomerCancelledBookings', {
            customerId,
            daysBack: 30,
          }),
        );

        if (!cancelledResponse.success) {
          this.logger.warn(`Failed to get cancelled bookings for customer ${customerId}: ${cancelledResponse.message}`);
          return [];
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to check cancel driver at booking-service: ${String(error)}`, errorMessage);
      }

      const rejectedBookings = cancelledResponse.data;

      if (!rejectedBookings || rejectedBookings.length === 0) {
        this.logger.log(`No cancelled bookings found for customer ${customerId}`);
        return [];
      }

      const cancellationCounts = rejectedBookings.reduce(
        (acc: Record<string, number>, booking: any) => {
          if (booking.driverId) {
            acc[booking.driverId] = (acc[booking.driverId] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      );

      const blockedDrivers = (Object.entries(cancellationCounts) as Array<[string, number]>)
        .filter(([, count]) => count >= 3)
        .map(([driverId]) => driverId);

      this.logger.log(
        `Processed ${rejectedBookings.length} cancelled bookings for customer ${customerId}. ` +
          `Found ${blockedDrivers.length} drivers to block: ${blockedDrivers.join(', ')}`,
      );

      if (blockedDrivers.length > 0) {
        try {
          await this.redis.sadd(`customer:${customerId}:blocked-drivers`, ...blockedDrivers);
          await this.redis.expire(`customer:${customerId}:blocked-drivers`, 3600); // 1 hour instead of 24h
          this.logger.log(`Cached ${blockedDrivers.length} blocked drivers for customer ${customerId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Error caching blocked drivers for customer ${customerId}: ${errorMessage}`);
        }
      }

      return blockedDrivers;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting blocked drivers for customer ${customerId}: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Get customer's trip history for smart matching
   */
  private async getCustomerTripHistory(customerId: string) {
    try {
      // Get completed trips from last 90 days
      const tripHistory = await firstValueFrom(
        this.bookingServiceClient.send('getCustomerBookingHistory', { customerId, daysBack: 90, limit: 50 }),
      );

      if (!tripHistory.success) {
        this.logger.warn(`Failed to get trip history for customer ${customerId}: ${tripHistory.message}`);
        return [];
      }

      return tripHistory.data;
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
      if (preferences.preferredVehicleTypes && !preferences.preferredVehicleTypes.includes(driver.vehicleType)) {
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
    const driverFrequency = customerHistory.reduce(
      (acc, trip) => {
        if (trip.driverId) {
          acc[trip.driverId] = (acc[trip.driverId] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

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
          timestamp: new Date().toISOString(),
        }),
        'EX',
        600, // 10 minutes cache
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
      bookingId,
    };

    return this.findDrivers(enhancedDto);
  }

  async checkDriverAvailability(
    driverId: string,
    customerId?: string,
  ): Promise<{
    isAvailable: boolean;
    status: string;
    reason?: string;
  }> {
    try {
      // Check basic availability
      let driver = null;
      try {
        const driverResponse = await firstValueFrom(
          this.userServiceClient.send('checkDriverAvailability', { driverId }),
        );
        if (!driverResponse.success) {
          this.logger.error(`Failed to check driver availability: ${driverResponse.message}`);
          return {
            isAvailable: false,
            status: 'error',
            reason: 'Failed to check availability',
          };
        }
        driver = driverResponse.data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to check driver availability: ${String(error)}`, errorMessage);
      }

      if (!driver || !driver.status) {
        return {
          isAvailable: false,
          status: 'offline',
          reason: 'Driver is offline',
        };
      }

      const hasActiveTrip = await this.hasActiveBooking(driverId);
      if (hasActiveTrip) {
        return {
          isAvailable: false,
          status: 'busy',
          reason: 'Driver has an active booking',
        };
      }

      // Check customer-specific blocks if customerId provided
      if (customerId) {
        const blockedDrivers = await this.getBlockedDrivers(customerId);
        if (blockedDrivers.includes(driverId)) {
          return {
            isAvailable: false,
            status: 'blocked',
            reason: 'Driver is blocked for this customer',
          };
        }
      }

      return {
        isAvailable: true,
        status: 'available',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking driver availability: ${errorMessage}`);
      return {
        isAvailable: false,
        status: 'error',
        reason: 'Error checking availability',
      };
    }
  }

  /**
   * Check if driver has active booking
   */
  private async hasActiveBooking(driverId: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.bookingServiceClient.send('checkDriverActiveBooking', {
          driverId: driverId,
        }),
      );

      if (response.success) {
        const hasActive = response.data.hasActiveBooking;
        if (hasActive) {
          this.logger.log(`Driver ${driverId} has active booking`);
        }
        return hasActive;
      }

      // Fallback: assume busy if service call fails
      this.logger.warn(`Failed to check active booking for driver ${driverId}, assuming busy`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking active booking for driver ${driverId}: ${errorMessage}`);
      return true; // Fail safe - assume driver is busy if we can't check
    }
  }

  /**
   * Get drivers with active bookings for exclusion
   */
  private async getDriversWithActiveBookings(driverIds: string[]): Promise<string[]> {
    try {
      if (driverIds.length === 0) return [];

      const response = await firstValueFrom(
        this.bookingServiceClient.send('checkDriversAvailability', {
          driverIds: driverIds,
        }),
      );

      if (response.success) {
        // Extract busy drivers from availability response
        const busyDrivers = response.data
          .filter((driver: any) => !driver.isAvailable)
          .map((driver: any) => driver.driverId);

        if (busyDrivers.length > 0) {
          this.logger.log(`Found ${busyDrivers.length} drivers with active bookings: ${busyDrivers.join(', ')}`);
        }

        return busyDrivers;
      }

      // Fallback: assume all busy if service call fails
      this.logger.warn('Failed to check drivers availability, assuming all are busy');
      return driverIds; // Fail safe - exclude all if we can't check
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting drivers with active bookings: ${errorMessage}`);
      return driverIds; // Fail safe - exclude all if we can't check
    }
  }

  /**
   * Filter out drivers with active bookings from candidate list
   */
  private async filterDriversByActiveBooking(drivers: any[]): Promise<any[]> {
    try {
      if (drivers.length === 0) return drivers;

      const driverIds = drivers.map(driver => driver.userId);
      const busyDrivers = await this.getDriversWithActiveBookings(driverIds);

      if (busyDrivers.length === 0) {
        this.logger.log('No drivers found with active bookings');
        return drivers;
      }

      const availableDrivers = drivers.filter(driver => !busyDrivers.includes(driver.userId));

      this.logger.log(`Filtered out ${busyDrivers.length} busy drivers, ${availableDrivers.length} drivers remaining`);

      return availableDrivers;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error filtering drivers by active booking: ${errorMessage}`);
      return []; // Fail safe - return empty if we can't filter properly
    }
  }
}
