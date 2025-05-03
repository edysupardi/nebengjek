export class DriverMatchDto {
  id: string;
  userId: string;
  name: string;
  phone: string;
  lastLatitude: number;
  lastLongitude: number;
  distance: number; // jarak dalam kilometer
  vehicleType?: string;
  plateNumber?: string;
  rating: number;
}

export class MatchResponseDto {
  success: boolean;
  message: string;
  data: DriverMatchDto[];
}