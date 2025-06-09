import { IsNumber, IsOptional, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class FindMatchDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value)) // Ensure number conversion
  latitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value)) // Ensure number conversion
  longitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value)) // Ensure number conversion
  radius: number = 1;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeDrivers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredDrivers?: string[];

  @IsOptional()
  @IsString()
  bookingId?: string; // For tracking which booking this search is for
}
