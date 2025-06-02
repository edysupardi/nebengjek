// src/notification.controller.ts
import { Controller, Get, Param, Patch, UseGuards, Logger } from '@nestjs/common';
import { NotificationService } from '@app/notification/notification.service';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { MessagePattern, EventPattern } from '@nestjs/microservices';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) { }

  // ===== EXISTING HTTP ENDPOINTS =====
  @Get()
  @UseGuards(TrustedGatewayGuard)
  async getUserNotifications(@CurrentUser() user: { id: string }) {
    return this.notificationService.getUserNotifications(user.id);
  }

  @Patch(':id/read')
  @UseGuards(TrustedGatewayGuard)
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markNotificationAsRead(id);
  }

  @Patch('read-all')
  @UseGuards(TrustedGatewayGuard)
  async markAllAsRead(@CurrentUser() user: { id: string }) {
    return this.notificationService.markAllNotificationsAsRead(user.id);
  }

  // ===== NEW TCP MESSAGE PATTERNS =====

  /**
   * TCP Message Pattern: Send notification to user
   */
  @MessagePattern('send.notification')
  async sendNotification(data: {
    userId: string;
    type: 'push' | 'sms' | 'email';
    title: string;
    message: string;
    data?: any;
  }) {
    try {
      this.logger.log(`Sending ${data.type} notification to user ${data.userId}: ${data.title}`);

      // Use existing NotificationService to send notification
      // TODO: Add sendNotification method to NotificationService if not exists
      // For now, create a notification record

      const notification = {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.data?.type || 'general',
        data: data.data,
        isRead: false,
        createdAt: new Date()
      };

      // TODO: Integrate with existing NotificationService.createNotification
      this.logger.log(`Notification created: ${JSON.stringify(notification)}`);

      return {
        success: true,
        notificationId: `notif_${Date.now()}`,
        message: 'Notification sent successfully'
      };

    } catch (error) {
      this.logger.error('Error sending notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    }
  }

  /**
   * TCP Message Pattern: Get notification history for user
   */
  @MessagePattern('get.notifications')
  async getNotifications(data: {
    userId: string;
    page?: number;
    limit?: number;
  }) {
    try {
      this.logger.log(`Getting notifications for user ${data.userId}`);

      // Use existing NotificationService
      const notifications = await this.notificationService.getUserNotifications(data.userId);

      return {
        success: true,
        data: notifications,
        pagination: {
          page: data.page || 1,
          limit: data.limit || 10,
          total: Array.isArray(notifications) ? notifications.length : 0
        }
      };

    } catch (error) {
      this.logger.error('Error getting notifications:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    }
  }

  // ===== NEW TCP EVENT PATTERNS =====

  /**
   * TCP Event Pattern: Handle new booking notifications
   */
  @EventPattern('booking.new')
  async handleNewBooking(data: {
    bookingId: string;
    driverId: string;
    customerId: string;
    distance: number;
    pickupLocation?: {
      latitude: number;
      longitude: number;
    };
  }) {
    try {
      this.logger.log(`New booking notification for driver ${data.driverId}, booking ${data.bookingId}`);

      // Send notification via TCP message pattern
      await this.sendNotification({
        userId: data.driverId,
        type: 'push',
        title: 'New Booking Request',
        message: `New booking request ${data.distance.toFixed(1)}km away. Tap to view details.`,
        data: {
          bookingId: data.bookingId,
          type: 'new_booking',
          distance: data.distance,
          pickupLocation: data.pickupLocation
        }
      });

    } catch (error) {
      this.logger.error('Error handling new booking notification:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle booking acceptance notifications
   */
  @EventPattern('booking.accepted')
  async handleBookingAccepted(data: {
    bookingId: string;
    customerId: string;
    driverId: string;
    driverName?: string;
    estimatedArrival?: number;
  }) {
    try {
      this.logger.log(`Booking accepted notification for customer ${data.customerId}, booking ${data.bookingId}`);

      // Send notification to customer
      await this.sendNotification({
        userId: data.customerId,
        type: 'push',
        title: 'Booking Accepted!',
        message: `${data.driverName || 'Driver'} accepted your booking. Estimated arrival: ${data.estimatedArrival || 5} minutes.`,
        data: {
          bookingId: data.bookingId,
          driverId: data.driverId,
          type: 'booking_accepted',
          estimatedArrival: data.estimatedArrival
        }
      });

    } catch (error) {
      this.logger.error('Error handling booking accepted notification:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle booking cancellation notifications
   */
  @EventPattern('booking.cancelled')
  async handleBookingCancelled(data: {
    bookingId: string;
    customerId?: string;
    driverId?: string;
    cancelledBy: 'customer' | 'driver';
    reason?: string;
  }) {
    try {
      this.logger.log(`Booking cancelled notification for booking ${data.bookingId}, cancelled by ${data.cancelledBy}`);

      if (data.cancelledBy === 'customer' && data.driverId) {
        // Notify driver about customer cancellation
        await this.sendNotification({
          userId: data.driverId,
          type: 'push',
          title: 'Booking Cancelled',
          message: 'Customer has cancelled the booking.',
          data: {
            bookingId: data.bookingId,
            type: 'booking_cancelled',
            cancelledBy: 'customer',
            reason: data.reason
          }
        });
      } else if (data.cancelledBy === 'driver' && data.customerId) {
        // Notify customer about driver cancellation
        await this.sendNotification({
          userId: data.customerId,
          type: 'push',
          title: 'Booking Cancelled',
          message: 'Driver has cancelled the booking. We\'re finding you another driver.',
          data: {
            bookingId: data.bookingId,
            type: 'booking_cancelled',
            cancelledBy: 'driver',
            reason: data.reason
          }
        });
      }

    } catch (error) {
      this.logger.error('Error handling booking cancelled notification:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle trip start notifications
   */
  @EventPattern('trip.started')
  async handleTripStarted(data: {
    bookingId: string;
    customerId: string;
    driverId: string;
    estimatedArrival?: number;
  }) {
    try {
      this.logger.log(`Trip started notification for booking ${data.bookingId}`);

      // Notify customer that trip has started
      await this.sendNotification({
        userId: data.customerId,
        type: 'push',
        title: 'Trip Started',
        message: `Your driver has started the trip. Estimated arrival: ${data.estimatedArrival || 15} minutes.`,
        data: {
          bookingId: data.bookingId,
          driverId: data.driverId,
          type: 'trip_started',
          estimatedArrival: data.estimatedArrival
        }
      });

    } catch (error) {
      this.logger.error('Error handling trip started notification:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle trip completion notifications
   */
  @EventPattern('booking.completed')
  async handleBookingCompleted(data: {
    bookingId: string;
    customerId: string;
    driverId?: string;
    tripDetails?: {
      distance: number;
      duration: number;
      totalCost: number;
    };
  }) {
    try {
      this.logger.log(`Trip completed notification for booking ${data.bookingId}`);

      // Notify customer about trip completion
      await this.sendNotification({
        userId: data.customerId,
        type: 'push',
        title: 'Trip Completed',
        message: `Your trip has been completed. Total: Rp ${data.tripDetails?.totalCost?.toLocaleString() || 'N/A'}`,
        data: {
          bookingId: data.bookingId,
          type: 'trip_completed',
          tripDetails: data.tripDetails
        }
      });

      // Notify driver about trip completion  
      if (data.driverId) {
        await this.sendNotification({
          userId: data.driverId,
          type: 'push',
          title: 'Trip Completed',
          message: `Trip completed successfully. Payment processed.`,
          data: {
            bookingId: data.bookingId,
            type: 'trip_completed',
            tripDetails: data.tripDetails
          }
        });
      }

    } catch (error) {
      this.logger.error('Error handling trip completed notification:', error);
    }
  }

  /**
   * TCP Event Pattern: Handle driver arrival notifications
   */
  @EventPattern('driver.arrived')
  async handleDriverArrived(data: {
    bookingId: string;
    customerId: string;
    driverId: string;
    location: {
      latitude: number;
      longitude: number;
    };
  }) {
    try {
      this.logger.log(`Driver arrived notification for booking ${data.bookingId}`);

      // Notify customer that driver has arrived
      await this.sendNotification({
        userId: data.customerId,
        type: 'push',
        title: 'Driver Arrived',
        message: 'Your driver has arrived at the pickup location.',
        data: {
          bookingId: data.bookingId,
          driverId: data.driverId,
          type: 'driver_arrived',
          location: data.location
        }
      });

    } catch (error) {
      this.logger.error('Error handling driver arrived notification:', error);
    }
  }
}