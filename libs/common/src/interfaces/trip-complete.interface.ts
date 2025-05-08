export interface TripCompletePayload {
  bookingId: string;
  tripDetails: {
    tripId: string;
    totalDistance: number;
    basePrice: number;
    platformFeePercentage: number;
    platformFeeAmount: number;
    driverAmount: number;
    finalPrice: number;
  };
}