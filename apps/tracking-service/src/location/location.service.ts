import { Injectable, Inject, Logger } from '@nestjs/common';
import { LocationRepository } from '@app/location/repositories/location.repository';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly locationRepository: LocationRepository,
    @Inject('REDIS_CLIENT') private readonly redis: any
  ) {}

  async updateLocation(userId: string, latitude: number, longitude: number) {
    try {
      // Save to database for history
      const location = await this.locationRepository.create({
        userId,
        latitude,
        longitude,
      });

      // Update Redis for real-time access
      await this.redis.set(
        `location:${userId}`,
        JSON.stringify({
          lat: latitude,
          lng: longitude,
          timestamp: new Date().toISOString()
        }),
        'EX',
        300 // 5 minutes expiry
      );

      this.logger.log(`Location updated for user ${userId}: ${latitude}, ${longitude}`);
      return location;
    } catch (error) {
      this.logger.error(`Failed to update location for user ${userId}:`, error);
      throw error;
    }
  }

  async getNearbyDrivers(latitude: number, longitude: number, radius: number = 1) {
    try {
      // Get all active drivers from Redis
      const driverKeys = await this.redis.keys('driver:active:*');
      const nearbyDrivers = [];

      for (const key of driverKeys) {
        const driverId = key.split(':')[2];
        const locationKey = `location:${driverId}`;
        const locationData = await this.redis.get(locationKey);

        if (locationData) {
          const driverLocation = JSON.parse(locationData);
          const distance = this.calculateDistance(
            latitude,
            longitude,
            driverLocation.lat,
            driverLocation.lng
          );

          if (distance <= radius) {
            nearbyDrivers.push({
              driverId,
              latitude: driverLocation.lat,
              longitude: driverLocation.lng,
              distance,
              lastUpdate: driverLocation.timestamp
            });
          }
        }
      }

      this.logger.log(`Found ${nearbyDrivers.length} nearby drivers within ${radius} km`);
      return nearbyDrivers.sort((a, b) => a.distance - b.distance);
    } catch (error) {
      this.logger.error('Failed to get nearby drivers:', error);
      throw error;
    }
  }

  async getUserLocation(userId: string) {
    try {
      // Try to get from Redis first
      const cachedLocation = await this.redis.get(`location:${userId}`);
      if (cachedLocation) {
        this.logger.log(`Location retrieved from cache for user ${userId}`);
        return JSON.parse(cachedLocation);
      }

      // If not in Redis, get latest from database
      const dbLocation = await this.locationRepository.findLatestByUser(userId);
      if (dbLocation) {
        this.logger.log(`Location retrieved from database for user ${userId}`);
        return {
          lat: dbLocation.latitude,
          lng: dbLocation.longitude,
          timestamp: dbLocation.createdAt
        };
      }

      this.logger.warn(`No location found for user ${userId}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to get location for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves location history for a specific user within a given time range.
   * If no time range is specified, defaults to the last 24 hours.
   * 
   * @param userId - The unique identifier of the user
   * @param startTime - Optional ISO date string for the start of the time range
   * @param endTime - Optional ISO date string for the end of the time range
   * @returns Promise containing an array of location records for the specified user and time range
   * @throws Error if start time is later than end time
   * @throws Error if database query fails or if dates are invalid
   */
  async getLocationHistory(userId: string, startTime?: string, endTime?: string) {
    try {
      const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      if (start > end) {
        this.logger.warn(`Invalid time range for user ${userId}: ${startTime} to ${endTime}`);
        throw new Error('Start time must be before end time');
      }

      this.logger.log(`Getting location history for user ${userId} from ${start} to ${end}`);
      return this.locationRepository.findByUserInTimeRange(userId, start, end);
    } catch (error) {
      this.logger.error(`Failed to get location history for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculates the great-circle distance between two points on Earth using the Haversine formula.
   * 
   * @param lat1 - The latitude of the first point in decimal degrees
   * @param lon1 - The longitude of the first point in decimal degrees
   * @param lat2 - The latitude of the second point in decimal degrees
   * @param lon2 - The longitude of the second point in decimal degrees
   * 
   * @returns The distance between the two points in kilometers
   * 
   * @remarks
   * This function uses the Haversine formula to calculate the shortest distance between two points
   * on a sphere (Earth). The calculation assumes Earth is perfectly spherical with a radius of 6371 km.
   * The actual distance may vary slightly due to Earth's ellipsoidal shape.
   * 
   * The Haversine formula:
   * a = sin²(Δφ/2) + cos φ1 ⋅ cos φ2 ⋅ sin²(Δλ/2)
   * c = 2 ⋅ atan2( √a, √(1−a) )
   * d = R ⋅ c
   * 
   * where φ is latitude, λ is longitude, and R is Earth's radius
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Converts degrees to radians.
   * This function is commonly used in geographical calculations where degrees need to be converted
   * to radians for trigonometric operations.
   * 
   * @param deg - The angle in degrees to convert
   * @returns The angle in radians
   */
  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}