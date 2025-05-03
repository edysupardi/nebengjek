import { Inject, Injectable } from "@nestjs/common";
import { LocationRepository } from "apps/tracking-service/src/location/repositories/location.repository";

@Injectable()
export class LocationService {
  constructor(
    private readonly locationRepository: LocationRepository,
    @Inject('REDIS_CLIENT') private redis: any
  ) {}

  async updateUserLocation(userId: string, lat: number, lng: number) {
    // Save to database for history
    await this.locationRepository.create({
      userId,
      latitude: lat,
      longitude: lng,
    });

    // Update Redis for real-time access
    await this.redis.set(
      `location:${userId}`,
      JSON.stringify({ lat, lng, timestamp: new Date() }),
      'EX',
      300 // 5 minutes expiry
    );
  }

  async getNearbyDrivers(lat: number, lng: number, radius: number = 1) {
    // Implementation for finding nearby drivers
    // This will be used by matching service
  }
}