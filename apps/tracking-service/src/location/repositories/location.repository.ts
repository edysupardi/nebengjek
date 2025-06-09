import { Location } from '@app/common/entities';
import { PrismaService } from '@app/database';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LocationRepository {
  // eslint-disable-next-line no-unused-vars
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

  async findMany(query: {
    where: {
      userId: string;
      timestamp: { gte: Date };
    };
    orderBy: { timestamp: 'desc' };
    take: number;
  }) {
    // Implement your database query logic here
    return this.prisma.location.findMany({
      where: query.where,
      orderBy: query.orderBy,
      take: query.take,
    });
  }

  async findFirst(query: { where: any; orderBy: any }) {
    return this.prisma.location.findFirst({
      where: query.where,
      orderBy: query.orderBy,
    });
  }
}
