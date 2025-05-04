import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class DriverProfileResponseDto {
  @Expose()
  @ApiProperty({ description: 'Driver profile ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Driver status (active/inactive)', example: true })
  status: boolean;

  @Expose()
  @ApiProperty({ description: 'Type of vehicle', example: 'Motor cycle', nullable: true })
  vehicleType: string | null;

  @Expose()
  @ApiProperty({ description: 'Vehicle plate number', example: 'B 1234 ABC', nullable: true })
  plateNumber: string | null;

  @Expose()
  @ApiProperty({ description: 'Driver rating', example: 4.5 })
  rating: number;

  @Expose()
  @ApiProperty({ description: 'Last known latitude', example: -6.2088, nullable: true })
  lastLatitude: number | null;

  @Expose()
  @ApiProperty({ description: 'Last known longitude', example: 106.8456, nullable: true })
  lastLongitude: number | null;

  @Expose()
  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Record last update timestamp' })
  updatedAt: Date;
}