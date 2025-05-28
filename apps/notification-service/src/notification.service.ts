// src/notification.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationGateway } from './websocket/notification.gateway';
import { BookingNotificationDto } from './dto/booking-notification.dto';
import { DriverNotificationDto } from './dto/driver-notification.dto';
import { CustomerNotificationDto } from './dto/customer-notification.dto';
import { TripNotificationDto } from './dto/trip-notification.dto';
import { CustomerNotificationType, DriverNotificationType, TripStatus } from '@app/common';
import { MessagingService } from '@app/messaging';
import { 
  BookingEvents, 
  TripEvents, 
  PaymentEvents,
  EventPayloadMap 
} from '@app/messaging/events/event-types';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationGateway: NotificationGateway,
    private readonly messagingService: MessagingService,
  ) {}

  onModuleInit() {
    this.subscribeToEvents();
  }

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
    this.notificationGateway.sendToCustomer(
      dto.customerId,
      'booking_update',
      {
        bookingId: dto.bookingId,
        status: dto.status,
        message: dto.message
      }
    );
    
    // If driver is assigned, notify them too
    if (dto.driverId) {
      await this.notificationRepository.saveNotification({
        userId: dto.driverId,
        type: `booking_${dto.status.toLowerCase()}`,
        content: dto.message,
        isRead: false,
        relatedId: dto.bookingId,
      });
      
      this.notificationGateway.sendToDriver(
        dto.driverId,
        'booking_update',
        {
          bookingId: dto.bookingId,
          status: dto.status,
          message: dto.message
        }
      );
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
    this.notificationGateway.sendToDriver(
      dto.driverId,
      dto.type,
      {
        ...dto,
        timestamp: new Date(),
      }
    );
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
    this.notificationGateway.sendToCustomer(
      dto.customerId,
      dto.type,
      {
        ...dto,
        timestamp: new Date(),
      }
    );
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
    
    this.notificationGateway.sendToCustomer(
      dto.customerId,
      'trip_update',
      {
        tripId: dto.tripId,
        status: dto.status,
        message: dto.message,
        distance: dto.distance,
        fare: dto.fare,
      }
    );
    
    // Notify driver
    await this.notificationRepository.saveNotification({
      userId: dto.driverId,
      type: `trip_${dto.status.toLowerCase()}`,
      content: dto.message,
      isRead: false,
      relatedId: dto.tripId,
    });
    
    this.notificationGateway.sendToDriver(
      dto.driverId,
      'trip_update',
      {
        tripId: dto.tripId,
        status: dto.status,
        message: dto.message,
        distance: dto.distance,
        fare: dto.fare,
      }
    );
  }

  // Event handlers
  private async handleBookingCreated(data: EventPayloadMap[BookingEvents.CREATED]) {
    // Notify nearby drivers about new booking
    // In a real app, this would use geospatial queries
    if (data.latitude && data.longitude) {
      this.notificationGateway.broadcastToNearbyDrivers(
        data.latitude,
        data.longitude,
        1, // 1km radius as per requirements
        'new_booking_request',
        {
          bookingId: data.bookingId,
          customerId: data.customerId,
          customerName: data.customerName,
          pickupLocation: {
            latitude: data.latitude,
            longitude: data.longitude,
          },
          timestamp: new Date(),
        }
      );
    }
    
    // Notify customer that booking was created
    await this.notifyCustomer({
      customerId: data.customerId,
      type: CustomerNotificationType.BOOKING_CREATED,
      bookingId: data.bookingId,
      message: 'Your booking has been created. Looking for nearby drivers...',
    });
  }

  private async handleBookingUpdated(data: EventPayloadMap[BookingEvents.UPDATED]) {
    if (data.status === 'ACCEPTED' && data.driverId) {
      // Notify customer that a driver accepted
      await this.notifyCustomer({
        customerId: data.customerId,
        type: CustomerNotificationType.DRIVER_ACCEPTED,
        bookingId: data.bookingId,
        driverId: data.driverId,
        driverName: data.driverName,
        driverLatitude: data.driverLatitude,
        driverLongitude: data.driverLongitude,
        estimatedArrivalTime: data.estimatedArrivalTime,
        message: `${data.driverName} has accepted your booking and is on the way!`,
      });
      
      // Notify driver with customer details
      await this.notifyDrivers({
        driverId: data.driverId,
        type: DriverNotificationType.BOOKING_ACCEPTED,
        bookingId: data.bookingId,
        customerId: data.customerId,
        customerName: data.customerId, // This should be the customer's name, but using ID as fallback
        message: `You've accepted a booking. Head to the pickup location.`,
      });
    } else if (data.status === 'REJECTED' || data.status === 'CANCELLED') {
      // Handle rejection/cancellation notifications
      const customerMessage = data.status === 'REJECTED' 
        ? 'The driver could not accept your booking. Looking for another driver...'
        : 'Your booking has been cancelled.';
        
      await this.notifyCustomer({
        customerId: data.customerId,
        type: data.status === 'REJECTED' 
          ? CustomerNotificationType.DRIVER_REJECTED 
          : CustomerNotificationType.BOOKING_CANCELLED,
        bookingId: data.bookingId,
        message: customerMessage,
      });
      
      if (data.driverId) {
        await this.notifyDrivers({
          driverId: data.driverId,
          type: DriverNotificationType.BOOKING_CANCELLED,
          bookingId: data.bookingId,
          message: 'This booking has been cancelled.',
        });
      }
    }
  }

  private async handleTripStarted(data: EventPayloadMap[TripEvents.STARTED]) {
    await this.notifyTripEvent({
      tripId: data.tripId,
      bookingId: data.bookingId,
      customerId: data.customerId,
      driverId: data.driverId,
      status: TripStatus.ONGOING,
      message: 'Your trip has started!',
    });
  }

  private async handleTripUpdated(data: EventPayloadMap[TripEvents.UPDATED]) {
    // Make sure we have the required data
    if (!data.tripId || !data.customerId || !data.driverId) {
      this.logger.warn('Incomplete data for trip update notification');
      return;
    }

    // If driver location is updated
    if (data.driverLatitude !== undefined && data.driverLongitude !== undefined) {
      // No need to save location updates in database to avoid spam
      // Just send via WebSocket

      // Send update to customer
      this.notificationGateway.sendToCustomer(
        data.customerId,
        'driver_location_update',
        {
          tripId: data.tripId,
          driverId: data.driverId,
          driverLatitude: data.driverLatitude,
          driverLongitude: data.driverLongitude,
          timestamp: new Date(),
          // Add ETA if available
          estimatedArrivalTime: data.estimatedArrivalTime,
          // Add distance to destination if available
          distanceToDestination: data.distanceToDestination
        }
      );

      // Optional: Log location update for debugging
      this.logger.debug(
        `Location update for trip ${data.tripId}: Driver at [${data.driverLatitude}, ${data.driverLongitude}]`
      );
    }

    // If there are other status updates (e.g., driver added notes, etc.)
    if (data.statusMessage) {
      await this.notificationRepository.saveNotification({
        userId: data.customerId,
        type: 'trip_status_update',
        content: data.statusMessage,
        isRead: false,
        relatedId: data.tripId,
      });

      this.notificationGateway.sendToCustomer(
        data.customerId,
        'trip_status_update',
        {
          tripId: data.tripId,
          message: data.statusMessage,
          timestamp: new Date()
        }
      );
    }

    // If ETA is updated
    if (data.updatedETA) {
      this.notificationGateway.sendToCustomer(
        data.customerId,
        'trip_eta_update',
        {
          tripId: data.tripId,
          estimatedArrivalTime: data.updatedETA,
          timestamp: new Date()
        }
      );
    }
  }

  private async handleTripEnded(data: EventPayloadMap[TripEvents.ENDED]) {
    await this.notifyTripEvent({
      tripId: data.tripId,
      bookingId: data.bookingId,
      customerId: data.customerId,
      driverId: data.driverId,
      status: TripStatus.COMPLETED,
      distance: data.distance,
      fare: data.fare,
      message: 'Your trip has been completed!',
    });
  }

  private async handlePaymentCompleted(data: EventPayloadMap[PaymentEvents.COMPLETED]) {
    await this.notifyCustomer({
      customerId: data.customerId,
      type: CustomerNotificationType.PAYMENT_COMPLETED,
      tripId: data.tripId,
      fare: data.amount,
      message: `Payment of IDR ${data.amount} has been completed successfully.`,
    });
    
    await this.notifyDrivers({
      driverId: data.driverId,
      type: DriverNotificationType.PAYMENT_COMPLETED,
      tripId: data.tripId,
      message: `You've received IDR ${data.driverAmount} for the trip.`,
    });
  }

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
}