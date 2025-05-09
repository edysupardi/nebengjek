// libs/common/src/entities/transaction.entity.ts
import { Trip } from './trip.entity';

export class Transaction {
  id: string;
  tripId: string;
  trip?: Trip;
  totalFare: number;
  driverShare: number;
  platformFee: number;
  discount: number;
  finalAmount: number;
  status: string; // 'pending', 'paid', 'cancelled'
  createdAt: Date;
  updatedAt: Date;
}