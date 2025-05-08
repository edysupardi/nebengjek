import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { Booking } from '@prisma/client';
import { BookingStatus } from '@app/common/enums/booking-status.enum';

@Injectable()
export class BookingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<Booking>): Promise<Booking> {
    return this.prisma.booking.create({
      data: data as any,
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
      },
    });
  }

  async update(id: string, data: Partial<Booking>): Promise<Booking> {
    return this.prisma.booking.update({
      where: { id },
      data,
      include: {
        customer: true,
        driver: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.booking.delete({
      where: { id },
    });
  }

  async findByUser(
    userId: string, 
    status?: BookingStatus, 
    skip = 0, 
    take = 10
  ): Promise<Booking[]> {
    const where: any = {
      OR: [
        { customerId: userId },
        { driverId: userId },
      ]
    };
    
    if (status) {
      where.status = status;
    }
    
    return this.prisma.booking.findMany({
      where,
      include: {
        customer: true,
        driver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    });
  }

  async countByUser(userId: string, status?: BookingStatus): Promise<number> {
    const where: any = {
      OR: [
        { customerId: userId },
        { driverId: userId },
      ]
    };
    
    if (status) {
      where.status = status;
    }
    
    return this.prisma.booking.count({
      where
    });
  }

  async findActiveBookingByCustomer(customerId: string): Promise<Booking | null> {
    return this.prisma.booking.findFirst({
      where: {
        customerId,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.ONGOING],
        },
      },
      include: {
        customer: true,
        driver: true,
      },
    });
  }

  async findActiveBookingByDriver(driverId: string): Promise<Booking | null> {
    return this.prisma.booking.findFirst({
      where: {
        driverId,
        status: {
          in: [BookingStatus.ACCEPTED, BookingStatus.ONGOING],
        },
      },
      include: {
        customer: true,
        driver: true,
      },
    });
  }
}