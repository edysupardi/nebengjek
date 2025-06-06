// src/dto/customer-notification.dto.ts
import { CustomerNotificationType } from '@app/common';
import { IsString, IsUUID, IsOptional, IsNumber, IsLatitude, IsLongitude, IsEnum } from 'class-validator';

export class CustomerNotificationDto {
  @IsUUID()
  customerId: string;

  @IsEnum(CustomerNotificationType)
  type: CustomerNotificationType;

  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @IsUUID()
  @IsOptional()
  tripId?: string;

  @IsUUID()
  @IsOptional()
  driverId?: string;

  @IsLatitude()
  @IsOptional()
  driverLatitude?: number;

  @IsLongitude()
  @IsOptional()
  driverLongitude?: number;

  @IsString()
  @IsOptional()
  driverName?: string;

  @IsNumber()
  @IsOptional()
  estimatedArrivalTime?: number;

  @IsNumber()
  @IsOptional()
  fare?: number;

  @IsString()
  message: string;
}
