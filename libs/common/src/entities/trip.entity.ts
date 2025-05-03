import { TripStatus } from '@prisma/client';
import { Booking } from './booking.entity';

export class Trip {
  id: string;
  bookingId: string;
  startTime: Date;
  endTime: Date | null; // null jika trip belum selesai
  distance: number; // dalam kilometer
  price: number; // Rp 3.000/km
  discount: number; // diskon dari driver (persentase)
  finalPrice: number; // harga setelah diskon
  status: TripStatus;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  booking?: Booking;
}