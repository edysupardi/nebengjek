export class PaymentResponseDto {
  id: string;
  tripId: string;
  totalFare: number;
  driverShare: number;
  platformFee: number;
  discount: number;
  finalAmount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}