import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { Trip } from '@app/common/entities';
import { Trip as PrismaTrip, Prisma } from '@prisma/client';

@Injectable()
export class TripRepository {
  constructor(private readonly prisma: PrismaService) {}

  private transformTripToDomain(prismaTrip: PrismaTrip & { 
    booking?: { 
      customer: any;
      driver: any | null;
    } | null 
  }): Trip {
    return {
      ...prismaTrip,
      booking: prismaTrip.booking ? {
        ...prismaTrip.booking,
        driver: prismaTrip.booking.driver ?? undefined,
        driverId: prismaTrip.booking.driver.id ?? undefined,
      } : undefined
    } as Trip;
  }

  async create(data: Partial<Trip>): Promise<Trip> {
    const prismaTrip = await this.prisma.trip.create({
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

    return this.transformTripToDomain(prismaTrip);
  }

  async findById(id: string): Promise<Trip | null> {
    const prismaTrip = await this.prisma.trip.findUnique({
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

    if(!prismaTrip) return null;
    return this.transformTripToDomain(prismaTrip);
  }

  async update(id: string, data: Partial<Trip>): Promise<Trip> {
    const prismaTrip = await this.prisma.trip.update({
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

    return this.transformTripToDomain(prismaTrip);
  }

  async findByBookingId(bookingId: string): Promise<Trip | null> {
    const prismaTrip = await this.prisma.trip.findFirst({
      where: { bookingId },
      include: {
        booking: {
          include: {
            customer: true,
            driver: true,
          },
        },
      },
    });

    if(!prismaTrip) return null;
    return this.transformTripToDomain(prismaTrip);
  }

  async findActiveTrips(): Promise<Trip[]> {
    const prismaTrips = await this.prisma.trip.findMany({
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

    return prismaTrips.map(trip => this.transformTripToDomain(trip));
  }

  async findByUserId(userId: string): Promise<Trip[]> {
    const prismaTrips = await this.prisma.trip.findMany({
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

    return prismaTrips.map(trip => this.transformTripToDomain(trip));
  }
  
  async findIncompleteTrips(): Promise<Trip[]> {
    const prismaTrips = await this.prisma.trip.findMany({
      where: {
        status: 'ONGOING',
        startTime: {
          lte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started more than 24 hours ago
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
    });

    return prismaTrips.map(trip => this.transformTripToDomain(trip));
  }
}