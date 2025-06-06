export class FinalPaymentDto {
  bookingId: string;
  tripId: string;
  customerId: string;
  driverId: string;
  totalAmount: number;
  driverAmount: number;
  platformFee: number;
  actualDistance: number;
  billableKm: number;
}
