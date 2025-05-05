import { IsEnum, IsNotEmpty } from 'class-validator';
import { BookingStatus } from '@app/common/enums/booking-status.enum';

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  @IsNotEmpty()
  status: BookingStatus;
}