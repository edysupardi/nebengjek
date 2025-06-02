export interface BookingNotification {
  bookingId: string;
  driverId: string;
  customerId: string; // ← ADD THIS
  distance: number;
  pickupLocation?: {  // ← ADD THIS
    latitude: number;
    longitude: number;
  };
}