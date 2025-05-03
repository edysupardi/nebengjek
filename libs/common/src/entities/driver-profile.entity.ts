import { User } from "./user.entity";

export class DriverProfile {
  id: string;
  userId: string;
  status: boolean; // online/offline
  lastLatitude?: number;
  lastLongitude?: number;
  vehicleType?: string;
  plateNumber?: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  user?: User;
}