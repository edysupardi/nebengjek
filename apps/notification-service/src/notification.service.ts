// src/notification.service.ts
import { BookingEvents, EventPayloadMap, MessagingService, PaymentEvents, TripEvents } from '@app/messaging';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BookingNotificationDto } from './dto/booking-notification.dto';
import { CustomerNotificationDto } from './dto/customer-notification.dto';
import { DriverNotificationDto } from './dto/driver-notification.dto';
import { TripNotificationDto } from './dto/trip-notification.dto';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationGateway } from './websocket/notification.gateway';

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
    this.logger.log('NotificationService initialized with modern messaging subscriptions');
  }

  private subscribeToEvents() {
    this.messagingService.subscribe(BookingEvents.CREATED, data => this.handleBookingCreated(data));
    this.messagingService.subscribe(BookingEvents.UPDATED, data => this.handleBookingUpdated(data));
    this.messagingService.subscribe(BookingEvents.ACCEPTED, data => this.handleBookingAccepted(data));
    this.messagingService.subscribe(BookingEvents.REJECTED, data => this.handleBookingRejected(data));
    this.messagingService.subscribe(BookingEvents.CANCELLED, data => this.handleBookingCancelled(data));
    this.messagingService.subscribe(BookingEvents.COMPLETED, data => this.handleBookingCompleted(data));

    this.messagingService.subscribe(TripEvents.STARTED, data => this.handleTripStarted(data));
    this.messagingService.subscribe(TripEvents.UPDATED, data => this.handleTripUpdated(data));
    this.messagingService.subscribe(TripEvents.LOCATION_UPDATED, data => this.handleTripLocationUpdated(data));
    this.messagingService.subscribe(TripEvents.ENDED, data => this.handleTripEnded(data));

    this.messagingService.subscribe(PaymentEvents.CALCULATED, data => this.handlePaymentCalculated(data));
    this.messagingService.subscribe(PaymentEvents.COMPLETED, data => this.handlePaymentCompleted(data));
    this.messagingService.subscribe(PaymentEvents.FAILED, data => this.handlePaymentFailed(data));

    this.logger.log('Subscribed to all messaging events');
  }

  async notifyBookingEvent(dto: BookingNotificationDto) {
    this.logger.log(`Notifying booking event: ${dto.status} for booking ${dto.bookingId}`);

    await this.notificationRepository.saveNotification({
      userId: dto.customerId,
      type: `booking_${dto.status.toLowerCase()}`,
      content: dto.message,
      isRead: false,
      relatedId: dto.bookingId,
    });

    this.notificationGateway.sendToCustomer(dto.customerId, 'booking_update', {
      bookingId: dto.bookingId,
      status: dto.status,
      message: dto.message,
    });

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

    await this.notificationRepository.saveNotification({
      userId: dto.driverId,
      type: dto.type,
      content: dto.message,
      isRead: false,
      relatedId: dto.bookingId || dto.tripId,
    });

    this.notificationGateway.sendToDriver(dto.driverId, dto.type, {
      ...dto,
      timestamp: new Date(),
    });
  }

  async notifyCustomer(dto: CustomerNotificationDto) {
    this.logger.log(`Sending notification to customer ${dto.customerId}: ${dto.type}`);

    await this.notificationRepository.saveNotification({
      userId: dto.customerId,
      type: dto.type,
      content: dto.message,
      isRead: false,
      relatedId: dto.bookingId || dto.tripId,
    });

    this.notificationGateway.sendToCustomer(dto.customerId, dto.type, {
      ...dto,
      timestamp: new Date(),
    });
  }

  async notifyTripEvent(dto: TripNotificationDto) {
    this.logger.log(`Notifying trip event: ${dto.status} for trip ${dto.tripId}`);

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

  private async handleBookingCreated(data: EventPayloadMap[BookingEvents.CREATED]) {
    this.logger.log(`Handling booking created: ${data.bookingId}`);

    // Send notification to customer
    const customerMessage = `Your booking request has been submitted and we're finding drivers nearby.`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'booking_created',
      content: customerMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'booking_created', {
      bookingId: data.bookingId,
      message: 'Booking created successfully',
      status: 'searching_drivers',
    });

    // **ENHANCED: Broadcast to nearby drivers with actual location filtering**
    const nearbyDriverMessage = `New booking request from ${data.customerName || 'customer'}`;

    this.logger.log(
      `Broadcasting booking ${data.bookingId} to drivers within 5km of ${data.latitude}, ${data.longitude}`,
    );

    // Use enhanced broadcast method with actual location filtering
    this.notificationGateway.broadcastToNearbyDrivers(
      data.latitude,
      data.longitude,
      5, // 5km radius
      BookingEvents.CREATED,
      {
        bookingId: data.bookingId,
        customerId: data.customerId,
        customerName: data.customerName,
        pickupLocation: {
          latitude: data.latitude,
          longitude: data.longitude,
        },
        destinationLocation: {
          latitude: data.destinationLatitude,
          longitude: data.destinationLongitude,
        },
        message: nearbyDriverMessage,
        radiusKm: 5,
        priority: 'high',
      },
    );

    this.logger.log(`Broadcast completed for booking ${data.bookingId}`);
  }

  private async handleBookingUpdated(data: EventPayloadMap[BookingEvents.UPDATED]) {
    this.logger.log(`Handling booking updated: ${data.bookingId}`);

    const customerMessage = `Your booking has been updated. Status: ${data.status}`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'booking_updated',
      content: customerMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'booking_updated', {
      bookingId: data.bookingId,
      status: data.status,
      driverName: data.driverName,
      driverLocation:
        data.driverLatitude && data.driverLongitude
          ? {
              latitude: data.driverLatitude,
              longitude: data.driverLongitude,
            }
          : null,
      estimatedArrivalTime: data.estimatedArrivalTime,
      message: customerMessage,
    });

    if (data.driverId) {
      const driverMessage = `Booking ${data.bookingId} has been updated`;

      await this.notificationRepository.saveNotification({
        userId: data.driverId,
        type: 'booking_updated',
        content: driverMessage,
        isRead: false,
        relatedId: data.bookingId,
      });

      this.notificationGateway.sendToDriver(data.driverId, 'booking_updated', {
        bookingId: data.bookingId,
        status: data.status,
        message: driverMessage,
      });
    }
  }

  private async handleBookingAccepted(data: EventPayloadMap[BookingEvents.ACCEPTED]) {
    this.logger.log(`Handling booking accepted: ${data.bookingId}`);

    const customerMessage = `Great! ${data.driverName || 'A driver'} has accepted your booking`;
    const driverMessage = `You have accepted booking ${data.bookingId}`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'booking_accepted',
      content: customerMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    await this.notificationRepository.saveNotification({
      userId: data.driverId,
      type: 'booking_accepted',
      content: driverMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'booking_accepted', {
      bookingId: data.bookingId,
      driverId: data.driverId,
      driverName: data.driverName,
      driverLocation:
        data.driverLatitude && data.driverLongitude
          ? {
              latitude: data.driverLatitude,
              longitude: data.driverLongitude,
            }
          : null,
      estimatedArrivalTime: data.estimatedArrivalTime,
      message: customerMessage,
    });

    this.notificationGateway.sendToDriver(data.driverId, 'booking_accepted', {
      bookingId: data.bookingId,
      customerId: data.customerId,
      message: driverMessage,
    });
  }

  private async handleBookingRejected(data: EventPayloadMap[BookingEvents.REJECTED]) {
    this.logger.log(`Handling booking rejected: ${data.bookingId}`);

    const driverMessage = `You have rejected booking ${data.bookingId}`;

    await this.notificationRepository.saveNotification({
      userId: data.driverId,
      type: 'booking_rejected',
      content: driverMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    this.notificationGateway.sendToDriver(data.driverId, 'booking_rejected', {
      bookingId: data.bookingId,
      message: driverMessage,
    });
  }

  private async handleBookingCancelled(data: EventPayloadMap[BookingEvents.CANCELLED]) {
    this.logger.log(`Handling booking cancelled: ${data.bookingId}`);

    const customerMessage = `Your booking has been cancelled by ${data.cancelledBy}`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'booking_cancelled',
      content: customerMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'booking_cancelled', {
      bookingId: data.bookingId,
      cancelledBy: data.cancelledBy,
      message: customerMessage,
    });

    if (data.driverId) {
      const driverMessage = `Booking ${data.bookingId} has been cancelled by ${data.cancelledBy}`;

      await this.notificationRepository.saveNotification({
        userId: data.driverId,
        type: 'booking_cancelled',
        content: driverMessage,
        isRead: false,
        relatedId: data.bookingId,
      });

      this.notificationGateway.sendToDriver(data.driverId, 'booking_cancelled', {
        bookingId: data.bookingId,
        cancelledBy: data.cancelledBy,
        message: driverMessage,
      });
    }
  }

  private async handleBookingCompleted(data: EventPayloadMap[BookingEvents.COMPLETED]) {
    this.logger.log(`Handling booking completed: ${data.bookingId}`);

    const customerMessage = `Your trip has been completed! Total fare: ${data.tripDetails.finalPrice || 'N/A'}`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'booking_completed',
      content: customerMessage,
      isRead: false,
      relatedId: data.bookingId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'booking_completed', {
      bookingId: data.bookingId,
      tripDetails: data.tripDetails,
      message: customerMessage,
    });
  }

  private async handleTripStarted(data: EventPayloadMap[TripEvents.STARTED]) {
    this.logger.log(`Handling trip started: ${data.tripId}`);

    const customerMessage = 'Your trip has started! Have a safe journey.';
    const driverMessage = `Trip ${data.tripId} has started`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'trip_started',
      content: customerMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    await this.notificationRepository.saveNotification({
      userId: data.driverId,
      type: 'trip_started',
      content: driverMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'trip_started', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      driverId: data.driverId,
      message: customerMessage,
    });

    this.notificationGateway.sendToDriver(data.driverId, 'trip_started', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      customerId: data.customerId,
      message: driverMessage,
    });
  }

  private async handleTripUpdated(data: EventPayloadMap[TripEvents.UPDATED]) {
    this.logger.log(`Handling trip updated: ${data.tripId}`);

    this.notificationGateway.sendToCustomer(data.customerId, 'trip_location_updated', {
      tripId: data.tripId,
      driverLocation:
        data.driverLatitude && data.driverLongitude
          ? {
              latitude: data.driverLatitude,
              longitude: data.driverLongitude,
            }
          : null,
      estimatedArrivalTime: data.estimatedArrivalTime,
      distanceToDestination: data.distanceToDestination,
      statusMessage: data.statusMessage,
      updatedETA: data.updatedETA,
    });
  }

  private async handleTripLocationUpdated(data: EventPayloadMap[TripEvents.LOCATION_UPDATED]) {
    this.logger.log(`Handling trip location updated: ${data.tripId}`);

    this.notificationGateway.sendToCustomer(data.tripId.replace('trip-', ''), 'driver_location_updated', {
      tripId: data.tripId,
      driverLocation: {
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });
  }

  private async handleTripEnded(data: EventPayloadMap[TripEvents.ENDED]) {
    this.logger.log(`Handling trip ended: ${data.tripId}`);

    const customerMessage = `Your trip has ended. Fare: ${data.fare}, Distance: ${data.actualDistance}km`;
    const driverMessage = `Trip completed. You earned: ${data.fare}`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'trip_ended',
      content: customerMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    await this.notificationRepository.saveNotification({
      userId: data.driverId,
      type: 'trip_ended',
      content: driverMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'trip_ended', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      fare: data.fare,
      distance: data.actualDistance,
      billableKm: data.billableKm,
      message: customerMessage,
    });

    this.notificationGateway.sendToDriver(data.driverId, 'trip_ended', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      fare: data.fare,
      distance: data.actualDistance,
      billableKm: data.billableKm,
      message: driverMessage,
    });
  }

  private async handlePaymentCalculated(data: EventPayloadMap[PaymentEvents.CALCULATED]) {
    this.logger.log(`Handling payment calculated: ${data.tripId}`);

    const message = `Payment calculated: ${data.amount} (Distance: ${data.distance}km)`;

    this.notificationGateway.sendToCustomer(data.bookingId, 'payment_calculated', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      amount: data.amount,
      distance: data.distance,
      platformFee: data.platformFee,
      driverAmount: data.driverAmount,
      message,
    });
  }

  private async handlePaymentCompleted(data: EventPayloadMap[PaymentEvents.COMPLETED]) {
    this.logger.log(`Handling payment completed: ${data.tripId}`);

    const customerMessage = `Payment of ${data.amount} has been processed successfully`;
    const driverMessage = `Payment received: ${data.driverAmount} (Trip: ${data.tripId})`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'payment_completed',
      content: customerMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    await this.notificationRepository.saveNotification({
      userId: data.driverId,
      type: 'payment_completed',
      content: driverMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'payment_completed', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      amount: data.amount,
      message: customerMessage,
    });

    this.notificationGateway.sendToDriver(data.driverId, 'payment_completed', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      driverAmount: data.driverAmount,
      platformFee: data.platformFee,
      message: driverMessage,
    });
  }

  private async handlePaymentFailed(data: EventPayloadMap[PaymentEvents.FAILED]) {
    this.logger.log(`Handling payment failed: ${data.tripId}`);

    const customerMessage = `Payment failed: ${data.reason}`;
    const driverMessage = `Payment failed for trip ${data.tripId}: ${data.reason}`;

    await this.notificationRepository.saveNotification({
      userId: data.customerId,
      type: 'payment_failed',
      content: customerMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    await this.notificationRepository.saveNotification({
      userId: data.driverId,
      type: 'payment_failed',
      content: driverMessage,
      isRead: false,
      relatedId: data.tripId,
    });

    this.notificationGateway.sendToCustomer(data.customerId, 'payment_failed', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      reason: data.reason,
      message: customerMessage,
    });

    this.notificationGateway.sendToDriver(data.driverId, 'payment_failed', {
      tripId: data.tripId,
      bookingId: data.bookingId,
      reason: data.reason,
      message: driverMessage,
    });
  }

  async getUserNotifications(userId: string) {
    return this.notificationRepository.getUnreadNotifications(userId);
  }

  async markNotificationAsRead(notificationId: string) {
    return this.notificationRepository.markAsRead(notificationId);
  }

  async markAllNotificationsAsRead(userId: string) {
    return this.notificationRepository.markAllAsRead(userId);
  }

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

      await this.notificationRepository.saveNotification(notificationData);

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

  /**
   * Debug method to get nearby drivers for testing
   */
  async getDebugNearbyDrivers(latitude: number, longitude: number, radiusKm: number = 5): Promise<any[]> {
    return this.notificationGateway.getNearbyDrivers(latitude, longitude, radiusKm);
  }

  /**
   * Debug method to get connection stats
   */
  getDebugConnectionStats(): any {
    return this.notificationGateway.getConnectionStats();
  }
}
