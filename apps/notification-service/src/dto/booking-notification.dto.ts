// src/dto/booking-notification.dto.ts
import { IsString, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { BookingStatus } from '@app/common/enums/booking-status.enum';

export class BookingNotificationDto {
  @IsUUID()
  bookingId: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  @IsOptional()
  driverId?: string;

  @IsEnum(BookingStatus)
  status: BookingStatus;

  @IsString()
  message: string;
}
