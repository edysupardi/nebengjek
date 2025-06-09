// src/dto/trip-notification.dto.ts
import { IsString, IsUUID, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { TripStatus } from '@app/common/enums/trip-status.enum';

export class TripNotificationDto {
  @IsUUID()
  tripId: string;

  @IsUUID()
  bookingId: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  driverId: string;

  @IsEnum(TripStatus)
  status: TripStatus;

  @IsNumber()
  @IsOptional()
  distance?: number;

  @IsNumber()
  @IsOptional()
  fare?: number;

  @IsString()
  message: string;
}
