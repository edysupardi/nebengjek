import { NearbyDriver } from '@app/common';
import { MessagingService } from '@app/messaging';
import { BookingEvents, EventPayloadMap } from '@app/messaging/events/event-types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DriverSearchHandler {
  private readonly logger = new Logger(DriverSearchHandler.name);

  constructor(
    private readonly messagingService: MessagingService,
    @Inject('MATCHING_SERVICE') private matchingServiceClient: ClientProxy,
    @Inject('REDIS_CLIENT') private redis: any,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 DriverSearchHandler onModuleInit called');
    // Subscribe to driver search requests
    this.messagingService.subscribe(BookingEvents.DRIVER_SEARCH_REQUESTED, this.handleDriverSearchRequest.bind(this));
    this.logger.log('✅ Driver search event listeners registered');
  }

  /**
   * Handle driver search request - ASYNC PROCESSING
   */
  private async handleDriverSearchRequest(payload: EventPayloadMap[BookingEvents.DRIVER_SEARCH_REQUESTED]) {
    try {
      this.logger.log(`🔍 [ASYNC] Searching drivers for booking ${payload.bookingId}`);

      // Find nearby drivers via matching service
      const nearbyDriversResponse = await this.executeWithRetry(async () => {
        return await firstValueFrom(
          this.matchingServiceClient.send('findDrivers', {
            latitude: payload.latitude,
            longitude: payload.longitude,
            radius: payload.radius || 1,
          }),
        );
      });

      let nearbyDrivers: NearbyDriver[] = [];
      let eligibleDriverIds: string[] = [];

      if (nearbyDriversResponse && nearbyDriversResponse.drivers && nearbyDriversResponse.drivers.length > 0) {
        nearbyDrivers = nearbyDriversResponse.drivers;
        eligibleDriverIds = nearbyDrivers.map((driver: NearbyDriver) => driver.userId);

        this.logger.log(`✅ Found ${nearbyDrivers.length} nearby drivers for booking ${payload.bookingId}`);

        // Store eligible drivers in Redis
        await this.executeWithRetry(async () => {
          await this.redis.sadd(`booking:${payload.bookingId}:eligible-drivers`, ...eligibleDriverIds);
          await this.redis.expire(`booking:${payload.bookingId}:eligible-drivers`, 7200); // 2 hours
        });

        // Update booking status in Redis
        await this.redis.hset(`booking:${payload.bookingId}`, 'status', 'drivers_found');

        // Publish drivers found event
        await this.messagingService.publish(BookingEvents.NEARBY_DRIVERS_FOUND, {
          bookingId: payload.bookingId,
          customerId: payload.customerId,
          nearbyDrivers: nearbyDrivers.map(driver => ({
            userId: driver.userId,
            latitude: driver.latitude,
            longitude: driver.longitude,
            distance: this.calculateDistance(payload.latitude, payload.longitude, driver.latitude, driver.longitude),
          })),
          searchRadius: payload.radius || 1,
          foundAt: new Date().toISOString(),
        });

        // Publish drivers ready event (for notifications)
        await this.messagingService.publish(BookingEvents.DRIVERS_READY, {
          bookingId: payload.bookingId,
          customerId: payload.customerId,
          customerName: payload.customerName,
          latitude: payload.latitude,
          longitude: payload.longitude,
          destinationLatitude: payload.destinationLatitude,
          destinationLongitude: payload.destinationLongitude,
          eligibleDriverIds: eligibleDriverIds,
          nearbyDrivers: nearbyDrivers.map(driver => ({
            userId: driver.userId,
            latitude: driver.latitude,
            longitude: driver.longitude,
            distance: this.calculateDistance(payload.latitude, payload.longitude, driver.latitude, driver.longitude),
          })),
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 minutes
        });
      } else {
        this.logger.warn(`❌ No nearby drivers found for booking ${payload.bookingId}`);

        // Update status to no drivers found
        await this.redis.hset(`booking:${payload.bookingId}`, 'status', 'no_drivers_found');

        // Notify customer no drivers found
        await this.messagingService.publish(BookingEvents.NEARBY_DRIVERS_FOUND, {
          bookingId: payload.bookingId,
          customerId: payload.customerId,
          nearbyDrivers: [],
          searchRadius: payload.radius || 1,
          foundAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error(`❌ Error searching drivers for booking ${payload.bookingId}:`, error);

      // Update status to search failed
      await this.redis.hset(`booking:${payload.bookingId}`, 'status', 'driver_search_failed');
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degreeToRadian(lat2 - lat1);
    const dLon = this.degreeToRadian(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreeToRadian(lat1)) *
        Math.cos(this.degreeToRadian(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private degreeToRadian(degree: number): number {
    return degree * (Math.PI / 180);
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.logger.warn(`Operation failed (attempt ${attempt}/${maxRetries}):`, error);
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }
    throw lastError;
  }
}
