// src/events/events.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { NotificationService } from '@app/notification/notification.service';
import { BookingNotificationDto } from '@app/notification/dto/booking-notification.dto';
import { DriverNotificationDto } from '@app/notification/dto/driver-notification.dto';
import { CustomerNotificationDto } from '@app/notification/dto/customer-notification.dto';
import { TripNotificationDto } from '@app/notification/dto/trip-notification.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('booking')
  async bookingEvent(@Body() dto: BookingNotificationDto) {
    await this.notificationService.notifyBookingEvent(dto);
    return { success: true };
  }

  @Post('driver')
  async driverEvent(@Body() dto: DriverNotificationDto) {
    await this.notificationService.notifyDrivers(dto);
    return { success: true };
  }

  @Post('customer')
  async customerEvent(@Body() dto: CustomerNotificationDto) {
    await this.notificationService.notifyCustomer(dto);
    return { success: true };
  }

  @Post('trip')
  async tripEvent(@Body() dto: TripNotificationDto) {
    await this.notificationService.notifyTripEvent(dto);
    return { success: true };
  }
}