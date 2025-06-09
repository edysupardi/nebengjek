import { MessagingService } from '@app/messaging';
import { BookingEvents, EventPayloadMap } from '@app/messaging/events/event-types';
import { NotificationGateway } from '@app/notification/websocket/notification.gateway';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class BookingEventHandler implements OnModuleInit {
  private readonly logger = new Logger(BookingEventHandler.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 BookingEventHandler onModuleInit called');
    try {
      this.setupEventListeners();
    } catch (error) {
      this.logger.error('❌ Failed to setup booking event listeners:', error);
    }
  }

  private setupEventListeners() {
    // Subscribe to booking events from Redis
    this.logger.log('🔧 Setting up booking event listeners...');

    try {
      // Subscribe to booking events from Redis
      this.messagingService.subscribe(BookingEvents.CREATED, this.handleBookingCreated.bind(this));
      this.logger.log('✅ Subscribed to BookingEvents.CREATED');

      this.messagingService.subscribe(BookingEvents.ACCEPTED, this.handleBookingAccepted.bind(this));
      this.logger.log('✅ Subscribed to BookingEvents.ACCEPTED');

      this.messagingService.subscribe(BookingEvents.CANCELLED, this.handleBookingCancelled.bind(this));
      this.logger.log('✅ Subscribed to BookingEvents.CANCELLED');

      this.messagingService.subscribe(BookingEvents.COMPLETED, this.handleBookingCompleted.bind(this));
      this.logger.log('✅ Subscribed to BookingEvents.COMPLETED');

      this.messagingService.subscribe(BookingEvents.NEARBY_DRIVERS_FOUND, this.handleNearbyDriversFound.bind(this));
      this.logger.log('✅ Subscribed to BookingEvents.NEARBY_DRIVERS_FOUND');

      // 🔍 ADD: Explicit debug untuk DRIVERS_READY subscription
      this.logger.log(`🔧 Subscribing to BookingEvents.DRIVERS_READY (${BookingEvents.DRIVERS_READY})...`);

      try {
        this.messagingService.subscribe(BookingEvents.DRIVERS_READY, this.handleDriversReady.bind(this));
        this.logger.log('✅ Successfully subscribed to BookingEvents.DRIVERS_READY');

        // 🔍 ADD: Test handler binding
        this.logger.log('🧪 Testing handleDriversReady binding...');
        if (typeof this.handleDriversReady === 'function') {
          this.logger.log('✅ handleDriversReady is a valid function');
        } else {
          this.logger.error('❌ handleDriversReady is not a function');
        }
      } catch (subscribeError) {
        this.logger.error('❌ Failed to subscribe to BookingEvents.DRIVERS_READY:', subscribeError);
      }

      this.messagingService.subscribe(
        'booking.smart_cancel_requested' as any,
        this.handleSmartCancelRequest.bind(this),
      );
      this.logger.log('✅ Subscribed to booking.smart_cancel_requested');

      this.logger.log('✅ Booking event listeners registered (Redis subscription)');
    } catch (error) {
      this.logger.error('❌ Error setting up event listeners:', error);
    }
  }

  /**
   * Handle booking.accepted event
   */
  private async handleBookingAccepted(payload: EventPayloadMap[BookingEvents.ACCEPTED]) {
    try {
      this.logger.log(`✅ [Redis Event] Handling booking.accepted for booking ${payload.bookingId}`);

      // Send notification to customer
      const notificationSent = this.notificationGateway.sendToCustomer(payload.customerId, 'booking.accepted', {
        bookingId: payload.bookingId,
        driverId: payload.driverId,
        driverName: payload.driverName || 'Driver',
        driverLatitude: payload.driverLatitude,
        driverLongitude: payload.driverLongitude,
        estimatedArrivalTime: payload.estimatedArrivalTime,
        message: `Driver ${payload.driverName || 'Unknown'} accepted your booking!`,
        driverPhone: payload.driverPhone,
        vehicleInfo: payload.vehicleInfo,
        actions: ['cancel'],
      });

      if (notificationSent) {
        this.logger.log(`✅ Booking accepted notification sent to customer ${payload.customerId}`);
      } else {
        this.logger.warn(`⚠️ Customer ${payload.customerId} not connected`);
      }

      // Notify other drivers that booking was taken
      this.notificationGateway.broadcastToAllDrivers('booking.taken', {
        bookingId: payload.bookingId,
        takenBy: payload.driverId,
        message: 'This booking was accepted by another driver',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`❌ Error handling booking.accepted event:`, error);
    }
  }

  /**
   * Handle booking.cancelled event
   */
  private async handleBookingCancelled(payload: EventPayloadMap[BookingEvents.CANCELLED]) {
    try {
      this.logger.log(`❌ [Redis Event] Handling booking.cancelled for booking ${payload.bookingId}`);

      if (payload.cancelledBy === 'customer' && payload.driverId) {
        // Notify driver about customer cancellation
        this.notificationGateway.sendToDriver(payload.driverId, 'booking.cancelled', {
          bookingId: payload.bookingId,
          customerId: payload.customerId,
          cancelledBy: payload.cancelledBy,
          message: 'Customer cancelled the booking',
        });
      } else if (payload.cancelledBy === 'driver' && payload.customerId) {
        // Notify customer about driver cancellation
        this.notificationGateway.sendToCustomer(payload.customerId, 'booking.cancelled', {
          bookingId: payload.bookingId,
          driverId: payload.driverId,
          cancelledBy: payload.cancelledBy,
          message: "Driver cancelled the booking. We'll find you another driver.",
        });
      }

      // Notify all drivers that booking is cancelled (cleanup)
      this.notificationGateway.broadcastToAllDrivers('booking.cancelled', {
        bookingId: payload.bookingId,
        cancelledBy: payload.cancelledBy,
        message: 'Booking cancelled',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ Booking cancelled notifications sent for booking ${payload.bookingId}`);
    } catch (error) {
      this.logger.error(`❌ Error handling booking.cancelled event:`, error);
    }
  }

  /**
   * Handle booking.completed event
   */
  private async handleBookingCompleted(payload: EventPayloadMap[BookingEvents.COMPLETED]) {
    try {
      this.logger.log(`✅ [Redis Event] Handling booking.completed for booking ${payload.bookingId}`);

      // Send completion notification to customer
      this.notificationGateway.sendToCustomer(payload.customerId, 'booking.completed', {
        bookingId: payload.bookingId,
        tripDetails: payload.tripDetails,
        message: 'Trip completed successfully! Thank you for using NebenJek.',
        finalPrice: payload.tripDetails?.finalPrice,
      });

      this.logger.log(`✅ Booking completed notification sent to customer ${payload.customerId}`);
    } catch (error) {
      this.logger.error(`❌ Error handling booking.completed event:`, error);
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degreeToRadian(lat2 - lat1);
    const dLon = this.degreeToRadian(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreeToRadian(lat1)) *
        Math.cos(this.degreeToRadian(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private degreeToRadian(degree: number): number {
    return degree * (Math.PI / 180);
  }

  private async handleBookingCreated(payload: EventPayloadMap[BookingEvents.CREATED]) {
    try {
      this.logger.log(`📋 [Event] Booking created ${payload.bookingId}, notifying customer`);

      // Send confirmation to customer
      this.notificationGateway.sendToCustomer(payload.customerId, 'booking.created', {
        bookingId: payload.bookingId,
        status: 'searching_drivers',
        message: 'Booking created! Searching for nearby drivers...',
        pickupLocation: payload.pickupLocation,
        destinationLocation: payload.destinationLocation,
        createdAt: payload.createdAt,
      });
    } catch (error) {
      this.logger.error(`❌ Error handling booking.created:`, error);
    }
  }

  /**
   * Handle nearby drivers found - notify customer about search results
   */
  private async handleNearbyDriversFound(payload: EventPayloadMap[BookingEvents.NEARBY_DRIVERS_FOUND]) {
    try {
      this.logger.log(
        `👥 [Event] Nearby drivers found for booking ${payload.bookingId}: ${payload.nearbyDrivers.length} drivers`,
      );

      if (payload.nearbyDrivers.length > 0) {
        // Notify customer: drivers found, waiting for acceptance
        this.notificationGateway.sendToCustomer(payload.customerId, 'booking.drivers_found', {
          bookingId: payload.bookingId,
          driversCount: payload.nearbyDrivers.length,
          status: 'drivers_found',
          message: `Found ${payload.nearbyDrivers.length} nearby drivers. Sending requests...`,
          searchRadius: payload.searchRadius,
          foundAt: payload.foundAt,
        });
      } else {
        // Notify customer: no drivers found
        this.notificationGateway.sendToCustomer(payload.customerId, 'booking.no_drivers', {
          bookingId: payload.bookingId,
          status: 'no_drivers_found',
          message: 'No drivers found nearby. Please try again later.',
          searchRadius: payload.searchRadius,
          foundAt: payload.foundAt,
        });
      }
    } catch (error) {
      this.logger.error(`❌ Error handling nearby drivers found:`, error);
    }
  }

  /**
   * Handle drivers ready - send booking cards to eligible drivers
   */
  private async handleDriversReady(payload: EventPayloadMap[BookingEvents.DRIVERS_READY]) {
    try {
      // 🔍 ADD: Strong debug indicator bahwa method dipanggil
      this.logger.log('🎯🎯🎯 [DRIVERS_READY] handleDriversReady method called! 🎯🎯🎯');
      this.logger.log(
        `🚗 [Event] Drivers ready for booking ${payload.bookingId}, sending to ${payload.eligibleDriverIds?.length || 0} drivers`,
      );

      // 🔍 ADD: Detailed payload debugging
      this.logger.log('📋 [DEBUG] Full DRIVERS_READY payload:', {
        bookingId: payload.bookingId,
        customerId: payload.customerId,
        customerName: payload.customerName,
        latitude: payload.latitude,
        longitude: payload.longitude,
        destinationLatitude: payload.destinationLatitude,
        destinationLongitude: payload.destinationLongitude,
        eligibleDriverIds: payload.eligibleDriverIds,
        nearbyDriversCount: payload.nearbyDrivers?.length || 0,
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt,
      });

      // Validate payload
      if (!payload.eligibleDriverIds || payload.eligibleDriverIds.length === 0) {
        this.logger.warn(`⚠️ No eligible drivers in payload for booking ${payload.bookingId}`);
        return;
      }

      // 🔍 ADD: Test notification gateway
      this.logger.log('🔧 Testing NotificationGateway...');
      if (!this.notificationGateway) {
        this.logger.error('❌ NotificationGateway is not available');
        return;
      }

      this.logger.log('✅ NotificationGateway is available');

      // Get connection stats untuk debug
      try {
        const stats = this.notificationGateway.getConnectionStats();
        this.logger.log('📊 Current WebSocket connections:', stats);
      } catch (statsError) {
        this.logger.warn('⚠️ Could not get connection stats:', statsError);
      }

      // Send booking cards to eligible drivers
      let successCount = 0;
      let failCount = 0;

      for (const driverId of payload.eligibleDriverIds) {
        try {
          const driver = payload.nearbyDrivers.find(d => d.userId === driverId);

          this.logger.log(`📤 [DEBUG] Sending booking card to driver ${driverId}...`);

          const success = this.notificationGateway.sendToDriver(driverId, 'booking.created', {
            bookingId: payload.bookingId,
            customerId: payload.customerId,
            customerName: payload.customerName || 'Customer',
            pickupLocation: {
              latitude: payload.latitude,
              longitude: payload.longitude,
            },
            destinationLocation: {
              latitude: payload.destinationLatitude,
              longitude: payload.destinationLongitude,
            },
            distanceToPickup: driver ? driver.distance : 0,
            tripDistance: this.calculateDistance(
              payload.latitude,
              payload.longitude,
              payload.destinationLatitude,
              payload.destinationLongitude,
            ),
            createdAt: payload.createdAt,
            expiresAt: payload.expiresAt,
            actions: ['accept', 'reject'],
            message: `New booking request from ${payload.customerName || 'Customer'}`,
          });

          if (success) {
            this.logger.log(`✅ [DEBUG] Booking card sent successfully to driver ${driverId}`);
            successCount++;
          } else {
            this.logger.warn(`⚠️ [DEBUG] Failed to send booking card to driver ${driverId} - driver not connected`);
            failCount++;
          }
        } catch (error) {
          this.logger.error(`❌ Failed to send booking card to driver ${driverId}:`, error);
          failCount++;
        }
      }

      this.logger.log(`📊 Booking cards sent: ${successCount} success, ${failCount} failed`);

      // Update customer: booking sent to drivers
      this.logger.log(`📤 [DEBUG] Sending confirmation to customer ${payload.customerId}...`);

      const customerSuccess = this.notificationGateway.sendToCustomer(payload.customerId, 'booking.sent_to_drivers', {
        bookingId: payload.bookingId,
        status: 'sent_to_drivers',
        driversCount: payload.eligibleDriverIds.length,
        message: `Booking request sent to ${payload.eligibleDriverIds.length} nearby drivers. Waiting for acceptance...`,
        expiresAt: payload.expiresAt,
      });

      if (customerSuccess) {
        this.logger.log(`✅ [DEBUG] Customer confirmation sent successfully for booking ${payload.bookingId}`);
      } else {
        this.logger.warn(`⚠️ [DEBUG] Failed to send customer confirmation - customer not connected`);
      }

      this.logger.log('🎯🎯🎯 [DRIVERS_READY] handleDriversReady completed successfully! 🎯🎯🎯');
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Error handling drivers ready:`, error);
      this.logger.error('❌ Full error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack available',
        bookingId: payload?.bookingId,
      });
    }
  }

  private async handleSmartCancelRequest(payload: {
    bookingId: string;
    customerId: string;
    reason: 'no_drivers_found' | 'all_drivers_rejected' | 'timeout' | 'system';
  }) {
    try {
      this.logger.log(`🤖 [Event] Handling smart cancel request for booking ${payload.bookingId}`);

      // Notify customer about auto cancellation
      const messages = {
        no_drivers_found: 'No drivers available in your area. Your booking has been automatically cancelled.',
        all_drivers_rejected: 'All nearby drivers are currently busy. Your booking has been automatically cancelled.',
        timeout: 'No driver accepted your booking in time. Your booking has been automatically cancelled.',
        system: 'Your booking has been cancelled by the system.',
      };

      this.notificationGateway.sendToCustomer(payload.customerId, 'booking.auto_cancelled', {
        bookingId: payload.bookingId,
        reason: payload.reason,
        message: messages[payload.reason] || messages.system,
        canRetry: payload.reason !== 'no_drivers_found',
      });
    } catch (error) {
      this.logger.error(`❌ Error handling smart cancel request:`, error);
    }
  }
}
