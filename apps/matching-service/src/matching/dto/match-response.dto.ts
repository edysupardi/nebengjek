export interface DriverMatchDto {
  id: string;
  userId: string;
  name: string;
  phone: string;
  lastLatitude: number;
  lastLongitude: number;
  distance: number;
  vehicleType: string;
  plateNumber: string;
  rating: number;

  // Customer-specific properties (optional)
  isPreferred?: boolean;
  previousTripCount?: number;

  // Additional properties for enhanced matching
  estimatedArrival?: number;
  status?: 'available' | 'busy' | 'offline';
  vehicleColor?: string;
}

export interface MatchResponseDto {
  success: boolean;
  message: string;
  data: DriverMatchDto[];

  // Additional response metadata
  searchRadius?: number;
  totalFound?: number;
  excludedCount?: number;
  isReMatch?: boolean;
}
