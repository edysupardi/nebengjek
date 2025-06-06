// libs/common/src/entities/user.entity.ts
import { UserRole } from '@prisma/client';
import { DriverProfile } from './driver-profile.entity';
import { Booking } from './booking.entity';
import { Location } from './location.entity';
import { Notification } from './notification.entity';

export class User {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  driverProfile?: DriverProfile;
  bookingsAsCustomer?: Booking[];
  bookingsAsDriver?: Booking[];
  locations?: Location[];
  notifications?: Notification[];
}
