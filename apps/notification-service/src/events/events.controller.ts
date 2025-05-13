// src/events/events.controller.ts
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationService } from '../notification.service';
import { BookingNotificationDto } from '../dto/booking-notification.dto';
import { TripNotificationDto } from '../dto/trip-notification.dto';
import { CustomerNotificationDto } from '../dto/customer-notification.dto';
import { DriverNotificationDto } from '../dto/driver-notification.dto';
import { MessagingService } from '@app/messaging';
import { BookingEvents, TripEvents, PaymentEvents } from '@app/messaging/events/event-types';

@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly messagingService: MessagingService,
  ) {}

  // Legacy event patterns for backward compatibility
  @EventPattern('booking.new')
  async handleNewBooking(@Payload() data: any) {
    this.logger.log(`Received legacy booking.new event: ${JSON.stringify(data)}`);
    // Forward to the new messaging system
    await this.messagingService.publish(BookingEvents.CREATED, {
      bookingId: data.bookingId,
      customerId: data.customerId,
      latitude: data.latitude || data.pickupLatitude,
      longitude: data.longitude || data.pickupLongitude,
      destinationLatitude: data.destinationLatitude,
      destinationLongitude: data.destinationLongitude,
      customerName: data.customerName,
    });
  }

  @EventPattern('booking.accepted')
  async handleBookingAccepted(@Payload() data: any) {
    this.logger.log(`Received legacy booking.accepted event: ${JSON.stringify(data)}`);
    // Forward to the new messaging system
    await this.messagingService.publish(BookingEvents.ACCEPTED, {
      bookingId: data.bookingId,
      customerId: data.customerId,
      driverId: data.driverId,
      driverName: data.driverName,
      driverLatitude: data.driverLatitude,
      driverLongitude: data.driverLongitude,
      estimatedArrivalTime: data.estimatedArrivalTime,
    });
  }

  @EventPattern('booking.cancelled')
  async handleBookingCancelled(@Payload() data: any) {
    this.logger.log(`Received legacy booking.cancelled event: ${JSON.stringify(data)}`);
    // Forward to the new messaging system
    await this.messagingService.publish(BookingEvents.CANCELLED, {
      bookingId: data.bookingId,
      customerId: data.customerId,
      driverId: data.driverId,
      cancelledBy: data.cancelledBy || 'system',
    });
  }

  @EventPattern('trip.started')
  async handleTripStarted(@Payload() data: any) {
    this.logger.log(`Received legacy trip.started event: ${JSON.stringify(data)}`);
    // Forward to the new messaging system
    await this.messagingService.publish(TripEvents.STARTED, {
      tripId: data.tripId || `trip-${data.bookingId}`, // Generate temp ID if not provided
      bookingId: data.bookingId,
      driverId: data.driverId,
      customerId: data.customerId,
      pickupLocation: {
        latitude: data.pickupLocation?.latitude || 0,
        longitude: data.pickupLocation?.longitude || 0,
      },
    });
  }

  @EventPattern('payment.completed')
  async handlePaymentCompleted(@Payload() data: any) {
    this.logger.log(`Received legacy payment.completed event: ${JSON.stringify(data)}`);
    // Forward to the new messaging system
    await this.messagingService.publish(PaymentEvents.COMPLETED, {
      tripId: data.tripId,
      bookingId: data.bookingId || '',
      customerId: data.customerId,
      driverId: data.driverId,
      amount: data.amount,
      driverAmount: data.driverAmount,
      platformFee: data.amount - data.driverAmount,
    });
  }

  // Direct API methods for notification
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
}