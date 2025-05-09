// apps/payment-service/src/payment/repositories/transaction.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database/prisma/prisma.service';
import { Transaction } from '@app/common/entities';

@Injectable()
export class TransactionRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    tripId: string;
    totalFare: number;
    driverShare: number;
    platformFee: number;
    discount: number;
    finalAmount: number;
    status: string;
  }): Promise<Transaction> {
    // Gunakan await di sini untuk mendapatkan hasil akhir, bukan Promise
    const result = await this.prisma.transaction.create({
      data,
      include: {
        trip: true,
      },
    });
    
    return result as unknown as Transaction;
  }

  async findByTripId(tripId: string): Promise<Transaction | null> {
    const result = await this.prisma.transaction.findUnique({
      where: { tripId },
      include: {
        trip: true,
      },
    });
    
    return result as unknown as Transaction;
  }

  async findById(id: string): Promise<Transaction | null> {
    const result = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        trip: true,
      },
    });
    
    return result as unknown as Transaction;
  }

  async update(
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'trip'>>,
  ): Promise<Transaction> {
    const result = await this.prisma.transaction.update({
      where: { id },
      data,
      include: {
        trip: true,
      },
    });
    
    return result as unknown as Transaction;
  }

  async listByDriverId(driverId: string): Promise<Transaction[]> {
    const results = await this.prisma.transaction.findMany({
      where: {
        trip: {
          booking: {
            driverId: driverId
          }
        },
      },
      include: {
        trip: {
          include: {
            booking: true
          }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return results as unknown as Transaction[];
  }

  async listByCustomerId(customerId: string): Promise<Transaction[]> {
    const results = await this.prisma.transaction.findMany({
      where: {
        trip: {
          booking: {
            customerId: customerId // or userId depending on your schema
          }
        },
      },
      include: {
        trip: {
          include: {
            booking: true
          }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return results as unknown as Transaction[];
  }
}