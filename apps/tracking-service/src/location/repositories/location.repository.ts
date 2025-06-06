import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { Location } from '@app/common/entities';

@Injectable()
export class LocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { userId: string; latitude: number; longitude: number }): Promise<Location> {
    return this.prisma.location.create({
      data,
    });
  }

  async findLatestByUser(userId: string): Promise<Location | null> {
    return this.prisma.location.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUserInTimeRange(userId: string, startTime: Date, endTime: Date): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: {
        userId,
        createdAt: {
          gte: startTime,
          lte: endTime,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
