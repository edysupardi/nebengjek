import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class FindMatchDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value)) // ✅ Ensure number conversion
  latitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value)) // ✅ Ensure number conversion
  longitude: number;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value)) // ✅ Ensure number conversion
  radius: number = 1;
}