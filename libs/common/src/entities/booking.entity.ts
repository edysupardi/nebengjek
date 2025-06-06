import { BookingStatus } from '../enums/booking-status.enum';
import { User } from './user.entity';
import { Trip } from './trip.entity';

export class Booking {
  id: string;
  customerId: string;
  driverId?: string;
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  status: BookingStatus;

  // Fields tracking waktu untuk setiap perubahan status
  acceptedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;

  // Relasi
  customer?: User;
  driver?: User;
  trip?: Trip;
}
