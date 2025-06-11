import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { MessagingService } from '@app/messaging';
import { BookingEvents } from '@app/messaging/events/event-types';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { BookingRepository } from './repositories/booking.repository';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly httpService: HttpService,
    @Inject('TRACKING_SERVICE') private trackingServiceClient: ClientProxy,
    @Inject('REDIS_CLIENT') private redis: any,
    private readonly messagingService: MessagingService,
  ) {}

  async createBooking(userId: string, createBookingDto: CreateBookingDto) {
    try {
      this.logger.log(`Creating booking for customer ${userId}`);

      // Check if user already has active booking
      const activeBooking = await this.bookingRepository.findActiveBookingByCustomer(userId);
      if (activeBooking) {
        throw new BadRequestException('You already have an active booking');
      }

      // 1. CREATE BOOKING RECORD ONLY
      const booking = await this.bookingRepository.create({
        customerId: userId,
        pickupLat: createBookingDto.pickupLatitude,
        pickupLng: createBookingDto.pickupLongitude,
        destinationLat: createBookingDto.destinationLatitude,
        destinationLng: createBookingDto.destinationLongitude,
        status: BookingStatus.PENDING,
      });

      // 2. STORE IN REDIS
      await this.executeWithRetry(async () => {
        await this.redis.hset(`booking:${booking.id}`, {
          id: booking.id,
          customerId: userId,
          pickupLatitude: createBookingDto.pickupLatitude,
          pickupLongitude: createBookingDto.pickupLongitude,
          destinationLatitude: createBookingDto.destinationLatitude,
          destinationLongitude: createBookingDto.destinationLongitude,
          createdAt: new Date().toISOString(),
          status: 'searching_drivers',
        });
        await this.redis.expire(`booking:${booking.id}`, 3600);

        const timeoutMinutes = parseInt(process.env.BOOKING_TIMEOUT_MINUTES || '3');
        const timeoutSeconds = timeoutMinutes * 60;

        await this.executeWithRetry(async () => {
          await this.redis.set(`booking:${booking.id}:timeout`, 'pending', 'EX', timeoutSeconds);
        });

        this.logger.log(`🕐 Booking ${booking.id} timeout set for ${timeoutMinutes} minutes`);
      });

      // 3. NOTIFY CUSTOMER: Booking created, searching drivers
      await this.messagingService.publish(BookingEvents.CREATED, {
        bookingId: booking.id,
        customerId: userId,
        latitude: createBookingDto.pickupLatitude,
        longitude: createBookingDto.pickupLongitude,
        destinationLatitude: createBookingDto.destinationLatitude,
        destinationLongitude: createBookingDto.destinationLongitude,
        customerName: booking.customer ? booking.customer.name : 'Customer',
        pickupLocation: {
          latitude: createBookingDto.pickupLatitude,
          longitude: createBookingDto.pickupLongitude,
        },
        destinationLocation: {
          latitude: createBookingDto.destinationLatitude,
          longitude: createBookingDto.destinationLongitude,
        },
        createdAt: new Date().toISOString(),
      });

      // 4. TRIGGER DRIVER SEARCH (ASYNC)
      await this.messagingService.publish(BookingEvents.DRIVER_SEARCH_REQUESTED, {
        bookingId: booking.id,
        customerId: userId,
        latitude: createBookingDto.pickupLatitude,
        longitude: createBookingDto.pickupLongitude,
        destinationLatitude: createBookingDto.destinationLatitude,
        destinationLongitude: createBookingDto.destinationLongitude,
        customerName: booking.customer ? booking.customer.name : 'Customer',
        radius: 1, // 1km radius
      });

      this.logger.log(`✅ Booking ${booking.id} created, driver search initiated`);
      return booking;
    } catch (error) {
      this.logger.error(`Failed to create booking:`, error);
      throw error;
    }
  }

  async getBookingDetails(bookingId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      return booking;
    } catch (error) {
      this.logger.error(`Failed to get booking details for ${bookingId}:`, error);
      throw error;
    }
  }

  async getUserBookings(userId: string, status?: BookingStatus, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const bookings = await this.bookingRepository.findByUser(userId, status, skip, limit);
      const total = await this.bookingRepository.countByUser(userId, status);

      return {
        data: bookings,
        meta: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get bookings for user ${userId}:`, error);
      throw error;
    }
  }

  async updateBookingStatus(bookingId: string, userId: string, status: BookingStatus, updatedAt?: Date) {
    try {
      // First check if booking exists
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      // Check if user is authorized to update this booking
      if (booking.customerId !== userId && booking.driverId !== userId) {
        this.logger.warn(`User ${userId} is not authorized to update booking ${bookingId}`);
        throw new UnauthorizedException('You are not authorized to update this booking');
      }

      // Validate status transitions
      this.validateStatusTransition(booking.status, status, userId, booking);

      // Update booking status
      const updateData: any = { status };
      const updateDateAt = updatedAt || new Date();
      switch (status) {
        case BookingStatus.ACCEPTED:
          updateData.acceptedAt = updateDateAt;
          break;
        case BookingStatus.REJECTED:
          updateData.rejectedAt = updateDateAt;
          break;
        case BookingStatus.CANCELLED:
          updateData.cancelledAt = updateDateAt;
          break;
        case BookingStatus.ONGOING:
          updateData.startedAt = updateDateAt;
          break;
        case BookingStatus.COMPLETED:
          updateData.completedAt = updateDateAt;
          break;
      }
      const updatedBooking = await this.bookingRepository.update(bookingId, updateData);

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to update booking status for ${bookingId}:`, error);
      throw error;
    }
  }

  async acceptBooking(bookingId: string, driverId: string) {
    const lockKey = `lock:booking:${bookingId}:accept`;
    const lockTimeout = 10; // 10 seconds

    try {
      // 1. ACQUIRE DISTRIBUTED LOCK untuk prevent race condition
      const lockAcquired = await this.redis.set(lockKey, driverId, 'PX', lockTimeout * 1000, 'NX');
      if (!lockAcquired) {
        this.logger.warn(`Booking ${bookingId} is being processed by another driver`);
        throw new BadRequestException('Booking is currently being processed by another driver. Please try again.');
      }

      // 2. CHECK DRIVER HAS NO ACTIVE BOOKING/TRIP
      const hasActive = await this.hasActiveBooking(driverId);
      if (hasActive) {
        this.logger.warn(`Driver ${driverId} already has an active booking`);
        throw new BadRequestException('You already have an active booking or trip. Complete it first.');
      }

      // 3. DOUBLE-CHECK BOOKING STATUS (race condition bisa terjadi sebelum lock)
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
        this.logger.warn(`Booking ${bookingId} is no longer available (status: ${booking.status})`);
        throw new BadRequestException(`Booking is no longer available`);
      }

      if (booking.driverId && booking.driverId !== driverId) {
        this.logger.warn(`Booking ${bookingId} already accepted by driver ${booking.driverId}`);
        throw new BadRequestException('Booking has already been accepted by another driver');
      }

      // 4. CHECK DRIVER ELIGIBILITY
      const isEligible = await this.isDriverEligibleForBooking(bookingId, driverId);
      if (!isEligible) {
        this.logger.warn(`Driver ${driverId} is not eligible to accept booking ${bookingId}`);
        const eligibleDrivers = await this.getEligibleDrivers(bookingId);
        this.logger.warn(`Eligible drivers for booking ${bookingId}: [${eligibleDrivers.join(', ')}]`);
        throw new UnauthorizedException('You are not eligible to accept this booking. Only nearby drivers can accept.');
      }

      // 5. ATOMIC UPDATE dengan additional validation
      const updatedBooking = await this.bookingRepository.updateWithCondition(
        bookingId,
        {
          status: BookingStatus.ACCEPTED,
          driverId,
          acceptedAt: new Date(),
        },
        {
          status: BookingStatus.PENDING,
          driverId: null, // ensure no other driver assigned
        },
      );

      if (!updatedBooking) {
        this.logger.warn(`Failed to update booking ${bookingId} - condition not met`);
        throw new BadRequestException('Booking is no longer available or has been taken by another driver');
      }

      this.logger.log(`✅ Driver ${driverId} successfully accepted booking ${bookingId}`);

      // 6. PUBLISH EVENTS
      // Event for customer: booking accepted
      await this.messagingService.publish(BookingEvents.ACCEPTED, {
        bookingId,
        customerId: booking.customerId,
        driverId,
        driverName: updatedBooking.driver?.name || 'Driver',
        driverLatitude: updatedBooking.driver?.driverProfile?.lastLatitude || 0,
        driverLongitude: updatedBooking.driver?.driverProfile?.lastLongitude || 0,
        estimatedArrivalTime: 0,
        driverPhone: updatedBooking.driver?.phone || '',
        vehicleInfo: {
          type: updatedBooking.driver?.driverProfile?.vehicleType?.toLowerCase() || 'motorcycle',
        },
      });

      // Event for other drivers: booking taken
      await this.messagingService.publish(BookingEvents.TAKEN, {
        bookingId,
        driverId,
        customerId: booking.customerId,
        timestamp: new Date().toISOString(),
      });

      // 7. CLEANUP
      await Promise.allSettled([
        this.redis.del(`booking:${bookingId}:eligible-drivers`),
        this.redis.del(`booking:${bookingId}:rejected-drivers`),
        this.redis.del(`booking:${bookingId}`),
      ]);

      this.logger.log(`Cleaned up Redis data for accepted booking ${bookingId}`);

      return updatedBooking;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to accept booking ${bookingId}: ${errorMessage}`, error);
      throw error;
    } finally {
      // 8. ALWAYS RELEASE LOCK
      try {
        await this.redis.del(lockKey);
      } catch (lockError) {
        this.logger.warn(`Failed to release lock for booking ${bookingId}:`, lockError);
      }
    }
  }

  async rejectBooking(bookingId: string, driverId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
        this.logger.warn(`Cannot reject booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(`Cannot reject booking with status ${booking.status}`);
      }

      // Update booking with rejected timestamp
      await this.bookingRepository.update(bookingId, {
        rejectedAt: new Date(),
      });

      // Store driver rejection in Redis to avoid re-matching
      await this.redis.sadd(`booking:${bookingId}:rejected-drivers`, driverId);

      const isAutoCancelEnabled = process.env.BOOKING_AUTO_CANCEL_ENABLED === 'true';
      if (isAutoCancelEnabled) {
        const allRejected = await this.checkAllDriversRejected(bookingId);
        if (allRejected) {
          this.logger.log(`🤖 All drivers rejected booking ${bookingId}, scheduling smart cancel`);

          // Delay 10 detik untuk memastikan tidak ada race condition
          setTimeout(async () => {
            try {
              await this.smartCancelBooking(bookingId, 'all_drivers_rejected');
            } catch (error) {
              this.logger.error(`Error smart cancelling booking ${bookingId}:`, error);
            }
          }, 10000); // 10 seconds delay
        }
      }

      return { message: 'Booking rejected successfully' };
    } catch (error) {
      this.logger.error(`Failed to reject booking ${bookingId}:`, error);
      throw error;
    }
  }

  async cancelBooking(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      // Only allow cancellation for PENDING or ACCEPTED bookings
      if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.ACCEPTED) {
        this.logger.warn(`Cannot cancel booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(`Cannot cancel booking with status ${booking.status}`);
      }

      // Verify that user is authorized to cancel
      if (booking.customerId !== userId && booking.driverId !== userId) {
        this.logger.warn(`User ${userId} is not authorized to cancel booking ${bookingId}`);
        throw new UnauthorizedException('You are not authorized to cancel this booking');
      }

      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      });

      // Determine who cancelled the booking
      const cancelledBy = userId === booking.customerId ? 'customer' : 'driver';

      // Publish to messaging service
      await this.messagingService.publish(BookingEvents.CANCELLED, {
        bookingId,
        customerId: booking.customerId,
        driverId: booking.driverId ?? undefined,
        cancelledBy,
      });

      try {
        await this.redis.del(`booking:${bookingId}:eligible-drivers`);
        await this.redis.del(`booking:${bookingId}:rejected-drivers`);
        this.logger.log(`Cleaned up driver lists for cancelled booking ${bookingId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to clean up driver lists: ${errorMessage}`);
      }

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to cancel booking ${bookingId}:`, error);
      throw error;
    }
  }

  async deleteBooking(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      // Only allow deletion for CANCELLED or COMPLETED bookings
      if (booking.status !== BookingStatus.CANCELLED && booking.status !== BookingStatus.COMPLETED) {
        this.logger.warn(`Cannot delete booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(`Cannot delete booking with status ${booking.status}`);
      }

      // Verify that user is authorized to delete
      if (booking.customerId !== userId) {
        this.logger.warn(`User ${userId} is not authorized to delete booking ${bookingId}`);
        throw new UnauthorizedException('Only the customer can delete a booking');
      }

      await this.bookingRepository.delete(bookingId);

      return { message: 'Booking deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete booking ${bookingId}:`, error);
      throw error;
    }
  }

  async completeBookingFromTrip(bookingId: string, completedAt: Date) {
    try {
      this.logger.log(`Completing booking ${bookingId} from trip service`);

      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.COMPLETED,
        completedAt: completedAt,
      });

      // Publish booking completed event
      await this.messagingService.publish(BookingEvents.COMPLETED, {
        bookingId: bookingId,
        customerId: updatedBooking.customerId,
        tripDetails: {
          completedAt: completedAt,
          status: 'COMPLETED',
        },
      });

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to complete booking from trip service:`, error);
      throw error;
    }
  }

  private validateStatusTransition(
    currentStatus: BookingStatus | any,
    newStatus: BookingStatus | any,
    userId: string,
    booking: any,
  ) {
    const isCustomer = userId === booking.customerId;
    const isDriver = userId === booking.driverId;

    switch (currentStatus) {
      case BookingStatus.PENDING:
        if (isCustomer && newStatus !== BookingStatus.CANCELLED) {
          throw new BadRequestException('Customer can only cancel a pending booking');
        }
        if (isDriver && ![BookingStatus.ACCEPTED, BookingStatus.REJECTED].includes(newStatus)) {
          throw new BadRequestException('Driver can only accept or reject a pending booking');
        }
        break;
      case BookingStatus.ACCEPTED:
        if (isCustomer && newStatus !== BookingStatus.CANCELLED) {
          throw new BadRequestException('Customer can only cancel an accepted booking');
        }
        if (isDriver && ![BookingStatus.CANCELLED, BookingStatus.ONGOING].includes(newStatus)) {
          throw new BadRequestException('Driver can only cancel or start an accepted booking');
        }
        break;
      case BookingStatus.ONGOING:
        if (!isDriver || newStatus !== BookingStatus.COMPLETED) {
          throw new BadRequestException('Only driver can complete an ongoing booking');
        }
        break;
      case BookingStatus.COMPLETED:
      case BookingStatus.CANCELLED:
      case BookingStatus.REJECTED:
        throw new BadRequestException(`Cannot change status of a ${currentStatus} booking`);
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Operation failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`);
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }
    throw lastError;
  }

  /**
   * Check if driver is eligible to accept this booking
   */
  private async isDriverEligibleForBooking(bookingId: string, driverId: string): Promise<boolean> {
    try {
      const isEligible = await this.redis.sismember(`booking:${bookingId}:eligible-drivers`, driverId);
      return isEligible === 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking driver eligibility: ${errorMessage}`);
      return false; // Fail safe - reject if can't verify
    }
  }

  /**
   * Get all eligible drivers for a booking
   */
  private async getEligibleDrivers(bookingId: string): Promise<string[]> {
    try {
      const eligibleDrivers = await this.redis.smembers(`booking:${bookingId}:eligible-drivers`);
      return eligibleDrivers || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting eligible drivers: ${errorMessage}`);
      return [];
    }
  }

  // ADD to existing booking.service.ts

  /**
   * Check availability for multiple drivers
   */
  async checkMultipleDriversAvailability(driverIds: string[]) {
    try {
      if (driverIds.length === 0) return [];

      const activeBookings = await this.bookingRepository.findMany({
        where: {
          driverId: { in: driverIds },
          status: { in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.ONGOING] },
        },
      });

      // Create availability map
      const busyDrivers = new Set(activeBookings.map(booking => booking.driverId).filter(Boolean));

      return driverIds.map(driverId => ({
        driverId,
        isAvailable: !busyDrivers.has(driverId),
        activeBooking: activeBookings.find(booking => booking.driverId === driverId) || null,
      }));
    } catch (error) {
      this.logger.error('Error checking multiple drivers availability:', error);
      throw error;
    }
  }

  /**
   * Get customer booking history for matching preferences
   */
  async getCustomerBookingHistory(customerId: string, daysBack: number, limit: number = 50) {
    try {
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      const bookings = await this.bookingRepository.findMany({
        where: {
          customerId: customerId,
          status: BookingStatus.COMPLETED,
          driverId: { not: null },
          createdAt: { gte: cutoffDate },
        },
        include: {
          id: true,
          driverId: true,
          createdAt: true,
          driver: {
            select: {
              name: true,
              driverProfile: {
                select: {
                  rating: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return bookings;
    } catch (error) {
      this.logger.error('Error getting customer booking history:', error);
      throw error;
    }
  }

  /**
   * Get customer cancelled bookings for blocked driver calculation
   */
  async getCustomerCancelledBookings(customerId: string, daysBack: number) {
    try {
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      const cancelledBookings = await this.bookingRepository.findMany({
        where: {
          customerId: customerId,
          status: BookingStatus.CANCELLED,
          driverId: { not: null },
          createdAt: { gte: cutoffDate },
        },
        include: {
          driverId: true,
          createdAt: true,
        },
      });

      return cancelledBookings;
    } catch (error) {
      this.logger.error('Error getting customer cancelled bookings:', error);
      throw error;
    }
  }

  /**
   * Get active booking statistics for monitoring
   */
  async getActiveBookingStatistics() {
    try {
      const stats = await this.bookingRepository.groupBy({
        by: ['status'],
        where: {
          status: { in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.ONGOING] },
          driverId: { not: null },
        },
        _count: { status: true },
      });

      const result = stats.reduce(
        (acc, stat) => {
          if (typeof stat._count === 'object' && 'status' in stat._count) {
            acc[stat.status] = stat._count.status;
          }
          return acc;
        },
        {} as Record<string, number>,
      );

      const totalActive = Object.values(result).reduce((sum, count) => sum + count, 0);

      return {
        totalActive,
        byStatus: result,
      };
    } catch (error) {
      this.logger.error('Error getting active booking statistics:', error);
      throw error;
    }
  }

  async hasActiveBooking(driverId: string): Promise<boolean> {
    try {
      // Check both booking and trip tables for active status
      const [activeBooking, activeTrip] = await Promise.allSettled([
        // Check active bookings
        this.bookingRepository.findFirst({
          where: {
            driverId: driverId,
            status: {
              in: [BookingStatus.ACCEPTED, BookingStatus.ONGOING],
            },
          },
          select: {
            id: true,
            status: true,
          },
        }),
        // Check active trips via tracking service
        this.checkActiveTripFromTrackingService(driverId),
      ]);

      // Process booking check result
      if (activeBooking.status === 'fulfilled' && activeBooking.value) {
        this.logger.log(
          `Driver ${driverId} has active booking ${activeBooking.value.id} with status ${activeBooking.value.status}`,
        );
        return true;
      }

      // Process trip check result
      if (activeTrip.status === 'fulfilled' && activeTrip.value) {
        this.logger.log(`Driver ${driverId} has active trip ${activeTrip.value.id}`);
        return true;
      }

      // Log any errors but don't fail the check
      if (activeBooking.status === 'rejected') {
        this.logger.warn(`Booking check failed for driver ${driverId}:`, activeBooking.reason);
      }

      if (activeTrip.status === 'rejected') {
        this.logger.warn(`Trip check failed for driver ${driverId}:`, activeTrip.reason);
      }

      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking active booking for driver ${driverId}: ${errorMessage}`);
      return true; // Fail safe - assume driver is busy if we can't check
    }
  }

  private async checkActiveTripFromTrackingService(driverId: string): Promise<any> {
    try {
      this.logger.log(`Checking active trip for driver ${driverId} via tracking service`);

      const result = await firstValueFrom(
        this.trackingServiceClient.send('getDriverActiveTrip', { driverId }).pipe(
          timeout(5000), // 5 second timeout
        ),
      );

      if (result && result.success && result.data) {
        this.logger.log(`Driver ${driverId} has active trip: ${result.data.id}`);
        return result.data;
      }

      this.logger.log(`Driver ${driverId} has no active trip`);
      return null;
    } catch (error: unknown) {
      // Handle timeout and connection errors gracefully
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.warn(`Timeout checking active trip for driver ${driverId} - assuming no active trip`);
        return null;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to check active trip for driver ${driverId}: ${errorMessage}`);

      // Return null instead of throwing - fail safe approach
      // Better to potentially allow a booking than block everything
      return null;
    }
  }

  /**
   * Smart cancel booking berdasarkan kondisi tertentu
   */
  async smartCancelBooking(
    bookingId: string,
    reason: 'no_drivers_found' | 'all_drivers_rejected' | 'timeout' | 'system',
  ): Promise<any> {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Smart cancel failed: Booking ${bookingId} not found`);
        return null;
      }

      // Only cancel if booking is still PENDING
      if (booking.status !== BookingStatus.PENDING) {
        this.logger.log(`Smart cancel skipped: Booking ${bookingId} status is ${booking.status}`);
        return null;
      }

      this.logger.log(`🤖 Smart cancelling booking ${bookingId}, reason: ${reason}`);

      // Update booking status to cancelled
      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      });

      // Publish cancellation event
      await this.messagingService.publish(BookingEvents.CANCELLED, {
        bookingId,
        customerId: booking.customerId,
        driverId: booking.driverId ?? undefined,
        cancelledBy: 'system',
      });

      // Cleanup Redis data
      await Promise.allSettled([
        this.redis.del(`booking:${bookingId}:eligible-drivers`),
        this.redis.del(`booking:${bookingId}:rejected-drivers`),
        this.redis.del(`booking:${bookingId}`),
        this.redis.del(`booking:${bookingId}:timeout`),
      ]);

      this.logger.log(`✅ Smart cancelled booking ${bookingId} successfully`);
      return updatedBooking;
    } catch (error) {
      this.logger.error(`❌ Error smart cancelling booking ${bookingId}:`, error);
      throw error;
    }
  }

  /**
   * Check if all eligible drivers have rejected the booking
   */
  private async checkAllDriversRejected(bookingId: string): Promise<boolean> {
    try {
      const [eligibleDrivers, rejectedDrivers] = await Promise.all([
        this.redis.smembers(`booking:${bookingId}:eligible-drivers`),
        this.redis.smembers(`booking:${bookingId}:rejected-drivers`),
      ]);

      if (!eligibleDrivers || eligibleDrivers.length === 0) {
        return false; // No eligible drivers, not rejection case
      }

      // Check if all eligible drivers have rejected
      const allRejected = eligibleDrivers.every((driverId: string) => rejectedDrivers.includes(driverId));

      if (allRejected) {
        this.logger.log(`All ${eligibleDrivers.length} eligible drivers rejected booking ${bookingId}`);
      }

      return allRejected;
    } catch (error) {
      this.logger.error(`Error checking rejected drivers for booking ${bookingId}:`, error);
      return false;
    }
  }
}
