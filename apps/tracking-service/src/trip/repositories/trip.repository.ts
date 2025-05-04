import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { Trip } from '@app/common/entities';

@Injectable()
export class TripRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<Trip>): Promise<Trip> {
    return this.prisma.trip.create({
      data: data as any,
      include: {
        booking: {
          include: {
            customer: true,
            driver: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<Trip | null> {
    return this.prisma.trip.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            customer: true,
            driver: true,
          },
        },
      },
    });
  }

  async update(id: string, data: Partial<Trip>): Promise<Trip> {
    return this.prisma.trip.update({
      where: { id },
      data: data as any,
      include: {
        booking: {
          include: {
            customer: true,
            driver: true,
          },
        },
      },
    });
  }

  async findByBookingId(bookingId: string): Promise<Trip | null> {
    return this.prisma.trip.findFirst({
      where: { bookingId },
      include: {
        booking: true,
      },
    });
  }

  async findActiveTrips(): Promise<Trip[]> {
    return this.prisma.trip.findMany({
      where: {
        status: 'ONGOING',
      },
      include: {
        booking: {
          include: {
            customer: true,
            driver: true,
          },
        },
      },
    });
  }

  async findByUserId(userId: string): Promise<Trip[]> {
    return this.prisma.trip.findMany({
      where: {
        booking: {
          OR: [
            { customerId: userId },
            { driverId: userId },
          ],
        },
      },
      include: {
        booking: {
          include: {
            customer: true,
            driver: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
  
  async findIncompleteTrips(): Promise<Trip[]> {
    return this.prisma.trip.findMany({
      where: {
        status: 'ONGOING',
        startTime: {
          lte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started more than 24 hours ago
        },
      },
      include: {
        booking: true,
      },
    });
  }
}