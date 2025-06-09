import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { PrismaService } from '@app/database';
import { Injectable } from '@nestjs/common';
import { Booking, DriverProfile, Prisma, User } from '@prisma/client';

type BookingWithRelations = Booking & {
  customer: User | null;
  driver:
    | (User & {
        driverProfile: DriverProfile | null;
      })
    | null;
};

@Injectable()
export class BookingRepository {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<Booking>): Promise<BookingWithRelations> {
    const prismaBooking = await this.prisma.booking.create({
      data: data as any,
      include: {
        customer: true,
        driver: true,
      },
    });

    return prismaBooking as BookingWithRelations;
  }

  async findById(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { id },
      include: {
        customer: true, // This will include all customer fields
        driver: true,
      },
    });
  }

  async update(id: string, data: Partial<Booking>): Promise<BookingWithRelations> {
    return this.prisma.booking.update({
      where: { id },
      data,
      include: {
        customer: true,
        driver: {
          include: {
            driverProfile: true,
          },
        },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.booking.delete({
      where: { id },
    });
  }

  async findByUser(userId: string, status?: BookingStatus, skip = 0, take = 10): Promise<Booking[]> {
    const where: any = {
      OR: [{ customerId: userId }, { driverId: userId }],
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
      OR: [{ customerId: userId }, { driverId: userId }],
    };

    if (status) {
      where.status = status;
    }

    return this.prisma.booking.count({
      where,
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

  async findMany(params: { where: any; include?: any; orderBy?: any; take?: number; skip?: number }) {
    return this.prisma.booking.findMany(params);
  }

  async groupBy({ by, where, _count }: { by: Prisma.BookingScalarFieldEnum[]; where: any; _count: any }) {
    return await this.prisma.booking.groupBy({
      by,
      where,
      _count,
    });
  }

  async findFirst(query: { where: any; select?: any }) {
    return this.prisma.booking.findFirst({
      where: query.where,
      select: query.select,
    });
  }

  async updateWithCondition(id: string, updateData: any, conditions: any): Promise<any> {
    try {
      const result = await this.prisma.booking.updateMany({
        where: {
          id,
          ...conditions,
        },
        data: updateData,
      });

      if (result.count === 0) {
        return null; // No rows updated - condition not met
      }

      // Return the updated booking
      return await this.findById(id);
    } catch (error) {
      throw error;
    }
  }
}
