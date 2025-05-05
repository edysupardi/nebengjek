import { IsNumber, IsNotEmpty, Min, Max, IsOptional } from 'class-validator';

export class GetNearbyDriversDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(10)
  radius?: number = 1; // Default 1km
}