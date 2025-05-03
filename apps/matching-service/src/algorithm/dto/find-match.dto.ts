export class FindMatchDto {
  customerId?: string | null;
  latitude: number;
  longitude: number;
  radius: number = 1; // Default radius 1 km
}