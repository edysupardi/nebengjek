// src/events/events.controller.ts
import { BookingNotificationDto } from '@app/notification/dto/booking-notification.dto';
import { CustomerNotificationDto } from '@app/notification/dto/customer-notification.dto';
import { DriverNotificationDto } from '@app/notification/dto/driver-notification.dto';
import { TripNotificationDto } from '@app/notification/dto/trip-notification.dto';
import { NotificationService } from '@app/notification/notification.service';
import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @MessagePattern('notify.booking')
  async notifyBookingEvent(@Payload() data: BookingNotificationDto) {
    this.logger.log(`Processing notify.booking message: ${JSON.stringify(data)}`);
    return this.notificationService.notifyBookingEvent(data);
  }

  @MessagePattern('notify.driver')
  async notifyDriver(@Payload() data: DriverNotificationDto) {
    this.logger.log(`Processing notify.driver message: ${JSON.stringify(data)}`);
    return this.notificationService.notifyDrivers(data);
  }

  @MessagePattern('notify.customer')
  async notifyCustomer(@Payload() data: CustomerNotificationDto) {
    this.logger.log(`Processing notify.customer message: ${JSON.stringify(data)}`);
    return this.notificationService.notifyCustomer(data);
  }

  @MessagePattern('notify.trip')
  async notifyTripEvent(@Payload() data: TripNotificationDto) {
    this.logger.log(`Processing notify.trip message: ${JSON.stringify(data)}`);
    return this.notificationService.notifyTripEvent(data);
  }

  @MessagePattern('send.notification')
  async sendNotification(
    @Payload() data: { userId: string; type: 'push' | 'sms' | 'email'; title: string; message: string; data?: any },
  ) {
    try {
      this.logger.log(`Sending ${data.type} notification to user ${data.userId}: ${data.title}`);
      return await this.notificationService.createNotification({
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.data?.type || 'general',
        relatedId: data.data?.bookingId || data.data?.tripId,
        data: data.data,
      });
    } catch (error) {
      this.logger.error('Error sending notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }

  @MessagePattern('get.notifications')
  async getNotifications(@Payload() data: { userId: string; page?: number; limit?: number }) {
    try {
      this.logger.log(`Getting notifications for user ${data.userId}`);
      const notifications = await this.notificationService.getUserNotifications(data.userId);
      return {
        success: true,
        data: notifications,
        pagination: {
          page: data.page || 1,
          limit: data.limit || 10,
          total: Array.isArray(notifications) ? notifications.length : 0,
        },
      };
    } catch (error) {
      this.logger.error('Error getting notifications:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      };
    }
  }
}
