import { User } from './user.entity';

export class Location {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  createdAt: Date;

  // Relasi
  user?: User;
}
