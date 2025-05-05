import { IsNumber, Min, Max, IsOptional } from 'class-validator';

export class EndTripDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage: number = 100; // Default 100% (no discount)
}