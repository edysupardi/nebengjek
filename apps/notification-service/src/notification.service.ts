// src/notification.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationGateway } from './websocket/notification.gateway';
import { BookingNotificationDto } from './dto/booking-notification.dto';
import { DriverNotificationDto } from './dto/driver-notification.dto';
import { CustomerNotificationDto } from './dto/customer-notification.dto';
import { TripNotificationDto } from './dto/trip-notification.dto';
import { CustomerNotificationType, DriverNotificationType, TripStatus } from '@app/common';
// import { MessagingService } from '@app/messaging'; // Commented out to fix Redis conflict
// import {
//   BookingEvents,
//   TripEvents,
//   PaymentEvents,
//   EventPayloadMap
// } from '@app/messaging/events/event-types'; // Commented out temporarily

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationGateway: NotificationGateway,
    // private readonly messagingService: MessagingService, // Commented out to fix Redis conflict
  ) {}

  onModuleInit() {
    // Temporarily disable messaging subscriptions to fix Redis conflict
    // this.subscribeToEvents();
    this.logger.log('NotificationService initialized (MessagingService temporarily disabled)');
  }

  /*
  // Temporarily commented out to fix Redis conflict
  private subscribeToEvents() {
    // Subscribe to booking events
    this.messagingService.subscribe(BookingEvents.CREATED, (data) => this.handleBookingCreated(data));
    this.messagingService.subscribe(BookingEvents.UPDATED, (data) => this.handleBookingUpdated(data));
    
    // Subscribe to trip events
    this.messagingService.subscribe(TripEvents.STARTED, (data) => this.handleTripStarted(data));
    this.messagingService.subscribe(TripEvents.UPDATED, (data) => this.handleTripUpdated(data));
    this.messagingService.subscribe(TripEvents.ENDED, (data) => this.handleTripEnded(data));
    
    // Subscribe to payment events
    this.messagingService.subscribe(PaymentEvents.COMPLETED, (data) => this.handlePaymentCompleted(data));

    this.logger.log('Subscribed to messaging events');
  }
  */

  // Direct API methods for notification sending
  async notifyBookingEvent(dto: BookingNotificationDto) {
    this.logger.log(`Notifying booking event: ${dto.status} for booking ${dto.bookingId}`);

    // Save notification to database
    await this.notificationRepository.saveNotification({
      userId: dto.customerId,
      type: `booking_${dto.status.toLowerCase()}`,
      content: dto.message,
      isRead: false,
      relatedId: dto.bookingId,
    });

    // Send WebSocket notification to customer
    this.notificationGateway.sendToCustomer(dto.customerId, 'booking_update', {
      bookingId: dto.bookingId,
      status: dto.status,
      message: dto.message,
    });

    // If driver is assigned, notify them too
    if (dto.driverId) {
      await this.notificationRepository.saveNotification({
        userId: dto.driverId,
        type: `booking_${dto.status.toLowerCase()}`,
        content: dto.message,
        isRead: false,
        relatedId: dto.bookingId,
      });

      this.notificationGateway.sendToDriver(dto.driverId, 'booking_update', {
        bookingId: dto.bookingId,
        status: dto.status,
        message: dto.message,
      });
    }
  }

  async notifyDrivers(dto: DriverNotificationDto) {
    this.logger.log(`Sending notification to driver ${dto.driverId}: ${dto.type}`);

    // Save notification to database
    await this.notificationRepository.saveNotification({
      userId: dto.driverId,
      type: dto.type,
      content: dto.message,
      isRead: false,
      relatedId: dto.bookingId || dto.tripId,
    });

    // Send WebSocket notification to driver
    this.notificationGateway.sendToDriver(dto.driverId, dto.type, {
      ...dto,
      timestamp: new Date(),
    });
  }

  async notifyCustomer(dto: CustomerNotificationDto) {
    this.logger.log(`Sending notification to customer ${dto.customerId}: ${dto.type}`);

    // Save notification to database
    await this.notificationRepository.saveNotification({
      userId: dto.customerId,
      type: dto.type,
      content: dto.message,
      isRead: false,
      relatedId: dto.bookingId || dto.tripId,
    });

    // Send WebSocket notification to customer
    this.notificationGateway.sendToCustomer(dto.customerId, dto.type, {
      ...dto,
      timestamp: new Date(),
    });
  }

  async notifyTripEvent(dto: TripNotificationDto) {
    this.logger.log(`Notifying trip event: ${dto.status} for trip ${dto.tripId}`);

    // Notify customer
    await this.notificationRepository.saveNotification({
      userId: dto.customerId,
      type: `trip_${dto.status.toLowerCase()}`,
      content: dto.message,
      isRead: false,
      relatedId: dto.tripId,
    });

    this.notificationGateway.sendToCustomer(dto.customerId, 'trip_update', {
      tripId: dto.tripId,
      status: dto.status,
      message: dto.message,
      distance: dto.distance,
      fare: dto.fare,
    });

    // Notify driver
    await this.notificationRepository.saveNotification({
      userId: dto.driverId,
      type: `trip_${dto.status.toLowerCase()}`,
      content: dto.message,
      isRead: false,
      relatedId: dto.tripId,
    });

    this.notificationGateway.sendToDriver(dto.driverId, 'trip_update', {
      tripId: dto.tripId,
      status: dto.status,
      message: dto.message,
      distance: dto.distance,
      fare: dto.fare,
    });
  }

  /*
  // Event handlers - temporarily commented out to fix Redis conflict
  // Will be re-enabled once TCP communication is working properly
  
  private async handleBookingCreated(data: any) {
    // Implementation here...
  }

  private async handleBookingUpdated(data: any) {
    // Implementation here...
  }

  private async handleTripStarted(data: any) {
    // Implementation here...
  }

  private async handleTripUpdated(data: any) {
    // Implementation here...
  }

  private async handleTripEnded(data: any) {
    // Implementation here...
  }

  private async handlePaymentCompleted(data: any) {
    // Implementation here...
  }
  */

  // User-facing methods for notification management
  async getUserNotifications(userId: string) {
    return this.notificationRepository.getUnreadNotifications(userId);
  }

  async markNotificationAsRead(notificationId: string) {
    return this.notificationRepository.markAsRead(notificationId);
  }

  async markAllNotificationsAsRead(userId: string) {
    return this.notificationRepository.markAllAsRead(userId);
  }

  // Add method for TCP handlers to call
  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: string;
    relatedId?: string;
    data?: any;
  }) {
    this.logger.log(`Creating notification for user ${data.userId}: ${data.title}`);

    try {
      const notificationData = {
        userId: data.userId,
        type: data.type,
        content: data.message,
        isRead: false,
        relatedId: data.relatedId,
      };
      this.logger.debug(`Notification data: ${JSON.stringify(notificationData)}`);
      // Save to database
      await this.notificationRepository.saveNotification(notificationData);

      // Send via WebSocket if needed
      this.notificationGateway.sendToCustomer(data.userId, data.type, {
        title: data.title,
        message: data.message,
        data: data.data,
        timestamp: new Date(),
      });

      return {
        success: true,
        notificationId: `notif_${Date.now()}`,
        message: 'Notification created successfully',
      };
    } catch (error) {
      this.logger.error('Error creating notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
