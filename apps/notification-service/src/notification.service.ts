// src/notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationGateway } from './websocket/notification.gateway';
import { RedisService } from '@app/database/redis/redis.service';
import { BookingNotificationDto } from './dto/booking-notification.dto';
import { DriverNotificationDto } from './dto/driver-notification.dto';
import { CustomerNotificationDto } from './dto/customer-notification.dto';
import { TripNotificationDto } from './dto/trip-notification.dto';
import { CustomerNotificationType, DriverNotificationType, TripStatus } from '@app/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationGateway: NotificationGateway,
    private readonly redisService: RedisService,
  ) {
    this.subscribeToRedisChannels();
  }

  private subscribeToRedisChannels() {
    // Subscribe to relevant Redis channels for inter-service communication
    const redisClient = this.redisService.getClient();
    
    redisClient.subscribe('booking:created');
    redisClient.subscribe('booking:updated');
    redisClient.subscribe('trip:started');
    redisClient.subscribe('trip:updated');
    redisClient.subscribe('trip:ended');
    redisClient.subscribe('payment:completed');
    
    redisClient.on('message', (channel, message) => {
      this.logger.log(`Received message from channel ${channel}`);
      this.handleRedisMessage(channel, message);
    });
  }

  private handleRedisMessage(channel: string, message: string) {
    try {
      const data = JSON.parse(message);
      
      switch (channel) {
        case 'booking:created':
          this.handleBookingCreated(data);
          break;
        case 'booking:updated':
          this.handleBookingUpdated(data);
          break;
        case 'trip:started':
          this.handleTripStarted(data);
          break;
        case 'trip:updated':
          this.handleTripUpdated(data);
          break;
        case 'trip:ended':
          this.handleTripEnded(data);
          break;
        case 'payment:completed':
          this.handlePaymentCompleted(data);
          break;
        default:
          this.logger.warn(`Unhandled channel: ${channel}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling message from channel ${channel}: ${errorMessage}`);
    }
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
  private async handleBookingCreated(data: any) {
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

  private async handleBookingUpdated(data: any) {
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
        customerName: data.customerName,
        latitude: data.latitude,
        longitude: data.longitude,
        message: `You've accepted a booking from ${data.customerName}. Head to the pickup location.`,
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

  private async handleTripStarted(data: any) {
    await this.notifyTripEvent({
      tripId: data.tripId,
      bookingId: data.bookingId,
      customerId: data.customerId,
      driverId: data.driverId,
      status: TripStatus.ONGOING,
      message: 'Your trip has started!',
    });
  }

  private async handleTripUpdated(data: any) {
    // Pastikan memiliki data yang diperlukan
    if (!data.tripId || !data.customerId || !data.driverId) {
      this.logger.warn('Incomplete data for trip update notification');
      return;
    }

    // Jika ada pembaruan lokasi driver
    if (data.driverLatitude !== undefined && data.driverLongitude !== undefined) {
      // Tidak perlu menyimpan notifikasi lokasi di database untuk menghindari spam
      // Cukup kirim melalui WebSocket

      // Kirim pembaruan lokasi ke pelanggan
      this.notificationGateway.sendToCustomer(
        data.customerId,
        'driver_location_update',
        {
          tripId: data.tripId,
          driverId: data.driverId,
          driverLatitude: data.driverLatitude,
          driverLongitude: data.driverLongitude,
          timestamp: new Date(),
          // Jika tersedia, tambahkan info perkiraan waktu kedatangan
          estimatedArrivalTime: data.estimatedArrivalTime,
          // Jika tersedia, tambahkan info jarak ke tujuan
          distanceToDestination: data.distanceToDestination
        }
      );

      // Opsional: Log pembaruan lokasi untuk debugging
      this.logger.debug(
        `Location update for trip ${data.tripId}: Driver at [${data.driverLatitude}, ${data.driverLongitude}]`
      );
    }

    // Jika ada pembaruan status lain (misalnya driver menambahkan catatan, dll)
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

    // Jika ada pembaruan ETA (Estimated Time of Arrival)
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

  private async handleTripEnded(data: any) {
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

  private async handlePaymentCompleted(data: any) {
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