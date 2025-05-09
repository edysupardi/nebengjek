// src/dto/driver-notification.dto.ts
import { DriverNotificationType } from '@app/common';
import { IsString, IsUUID, IsNumber, IsOptional, IsLatitude, IsLongitude, IsEnum } from 'class-validator';

export class DriverNotificationDto {
  @IsUUID()
  driverId: string;

  @IsEnum(DriverNotificationType)
  type: DriverNotificationType;

  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @IsUUID()
  @IsOptional()
  tripId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsNumber()
  @IsOptional()
  distance?: number;

  @IsString()
  message: string;
}