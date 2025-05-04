import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { Booking, BookingStatus } from '@app/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class BookingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(bookingData: Partial<Booking>): Promise<Booking> {
    return this.prisma.booking.create({
      data: bookingData as any,
      include: {
        customer: true,
        driver: true,
      },
    });
  }

  async findById(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { id },
      include: {
        customer: true,
        driver: true,
        trip: true,
      },
    });
  }

  async findByCustomerId(customerId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: { customerId },
      include: {
        driver: true,
        trip: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByDriverId(driverId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: { driverId },
      include: {
        customer: true,
        trip: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: BookingStatus): Promise<Booking> {
    return this.prisma.booking.update({
      where: { id },
      data: { status },
      include: {
        customer: true,
        driver: true,
      },
    });
  }

  async findActiveBookingsByDriver(driverId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: {
        driverId,
        status: {
          in: [BookingStatus.ACCEPTED, BookingStatus.PENDING],
        },
      },
      include: {
        customer: true,
        trip: true,
      },
    });
  }

  async findPendingBookingsInArea(lat: number, lng: number, radius: number): Promise<Booking[]> {
    // Menggunakan Prisma.$queryRaw dengan type safety yang lebih baik
    const result = await this.prisma.$queryRaw<Booking[]>(
      Prisma.sql`
        SELECT b.* 
        FROM "Booking" b
        WHERE b.status = ${BookingStatus.PENDING}
        AND (
          6371 * acos(
            cos(radians(${lat})) * cos(radians(b."pickupLat")) * 
            cos(radians(b."pickupLng") - radians(${lng})) + 
            sin(radians(${lat})) * sin(radians(b."pickupLat"))
          )
        ) <= ${radius}
        ORDER BY b."createdAt" DESC
      `
    );
    
    // Transform the result to match the expected format
    return result.map(booking => ({
      ...booking,
      createdAt: new Date(booking.createdAt),
      updatedAt: new Date(booking.updatedAt),
    }));
  }
}