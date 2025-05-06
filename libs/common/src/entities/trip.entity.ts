import { TripStatus } from '../enums/trip-status.enum';
import { Booking } from './booking.entity';

export class Trip {
  id: string;
  bookingId: string;
  startTime: Date;
  endTime: Date | null;
  distance: number;
  
  // Perhitungan harga yang lebih detail
  basePrice: number;
  discountAmount: number;
  discountPercentage: number;
  finalPrice: number;
  
  // Pembagian fee platform
  platformFeePercentage: number;
  platformFeeAmount: number;
  driverAmount: number;
  
  status: TripStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // Relasi
  booking?: Booking;
}