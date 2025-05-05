import { IsNumber, IsNotEmpty, Min, Max } from 'class-validator';

export class CreateBookingDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  pickupLatitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  pickupLongitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  destinationLatitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  destinationLongitude: number;
}