import { IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class FinalizePaymentDto {
  @IsUUID()
  tripId: string;

  @IsNumber()
  @Min(0)
  discount?: number = 0;
}