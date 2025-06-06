import { IsNumber, IsUUID, Min } from 'class-validator';

export class CalculateFareDto {
  @IsUUID()
  tripId: string;

  @IsNumber()
  @Min(0)
  distanceInKm: number;
}
