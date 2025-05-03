import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { RedisService } from '@app/database';
import { Location } from '@app/common/entities';

@Injectable()
export class LocationRepository{
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async saveLocation(userId: string, latitude: number, longitude: number): Promise<Location> {
    // Simpan ke database untuk history
    const location = await this.prisma.location.create({
      data: {
        userId,
        latitude,
        longitude,
        timestamp: new Date(),
      },
    });

    // Simpan ke Redis untuk akses cepat
    await this.redis.setDriverLocation(userId, latitude, longitude);

    return location;
  }

  async getLatestLocation(userId: string): Promise<Location | null> {
    // Cek di Redis dulu
    const redisLocation = await this.redis.getDriverLocation(userId);
    if (redisLocation) {
      return {
        id: 'redis-temp',
        userId,
        latitude: redisLocation.latitude,
        longitude: redisLocation.longitude,
        timestamp: new Date(redisLocation.timestamp),
        createdAt: new Date(redisLocation.timestamp),
      };
    }

    // Fallback ke database
    return this.prisma.location.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getLocationHistory(userId: string, startDate: Date, endDate: Date): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  async bulkSaveLocations(locations: Array<{userId: string; latitude: number; longitude: number}>): Promise<Location[]> {
    const locationData = locations.map(loc => ({
      userId: loc.userId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      timestamp: new Date(),
    }));

    // Bulk insert ke database
    const savedLocations = await this.prisma.location.createMany({
      data: locationData,
      skipDuplicates: true,
    });

    // Update Redis untuk setiap driver
    await Promise.all(
      locations.map(loc => 
        this.redis.setDriverLocation(loc.userId, loc.latitude, loc.longitude)
      )
    );

    // Return saved locations (perlu query lagi karena createMany tidak return data)
    return this.prisma.location.findMany({
      where: {
        userId: { in: locations.map(l => l.userId) },
        timestamp: { gte: new Date(Date.now() - 1000) } // Last 1 second
      },
    });
  }
}