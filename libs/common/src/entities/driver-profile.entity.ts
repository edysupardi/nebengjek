import { User } from './user.entity';

export class DriverProfile {
  id: string;
  userId: string;
  status: boolean; // online/offline
  lastLatitude: number | null;
  lastLongitude: number | null;
  vehicleType: string | null;
  plateNumber: string | null;
  rating: number;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  user?: User;
}
