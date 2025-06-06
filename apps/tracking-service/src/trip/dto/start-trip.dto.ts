import { IsString, IsNotEmpty } from 'class-validator';

export class StartTripDto {
  @IsString()
  @IsNotEmpty()
  bookingId: string;
}
