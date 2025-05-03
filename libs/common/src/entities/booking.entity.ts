import { BookingStatus } from '@prisma/client';
import { User } from './user.entity';
import { Trip } from './trip.entity';

export class Booking {
  id: string;
  customerId: string;
  driverId: string | null;  // Changed from driverId?: string to driverId: string | null
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  status: BookingStatus;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  customer?: User;
  driver?: User | null;  // Also support null for consistency
  trip?: Trip | null;    // Also support null for consistency
}