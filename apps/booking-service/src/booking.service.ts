import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { BookingNotification, NearbyDriver } from '@app/common';
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
import { firstValueFrom } from 'rxjs';
import { BookingRepository } from './repositories/booking.repository';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly httpService: HttpService,
    @Inject('NOTIFICATION_SERVICE') private notificationServiceClient: ClientProxy,
    @Inject('MATCHING_SERVICE') private matchingServiceClient: ClientProxy,
    @Inject('REDIS_CLIENT') private redis: any,
    private readonly messagingService: MessagingService,
  ) {}

  async createBooking(userId: string, createBookingDto: CreateBookingDto) {
    try {
      this.logger.log(`Creating booking for customer ${userId}`);

      // Check if user already has active booking
      const activeBooking = await this.bookingRepository.findActiveBookingByCustomer(userId);
      if (activeBooking) {
        this.logger.warn(`User ${userId} already has an active booking`);
        throw new BadRequestException('You already have an active booking');
      }

      // Create booking with PENDING status
      const booking = await this.bookingRepository.create({
        customerId: userId,
        pickupLat: createBookingDto.pickupLatitude,
        pickupLng: createBookingDto.pickupLongitude,
        destinationLat: createBookingDto.destinationLatitude,
        destinationLng: createBookingDto.destinationLongitude,
        status: BookingStatus.PENDING,
      });

      // Store booking in Redis with retry
      await this.executeWithRetry(async () => {
        await this.redis.set(
          `booking:${booking.id}`,
          JSON.stringify({
            id: booking.id,
            customerId: userId,
            pickupLocation: {
              latitude: createBookingDto.pickupLatitude,
              longitude: createBookingDto.pickupLongitude,
            },
            destinationLocation: {
              latitude: createBookingDto.destinationLatitude,
              longitude: createBookingDto.destinationLongitude,
            },
            createdAt: new Date().toISOString(),
          }),
          'EX',
          3600, // 1 hour expiry
        );
      });

      // Publish booking.created event
      await this.messagingService.publish(BookingEvents.CREATED, {
        bookingId: booking.id,
        customerId: userId,
        latitude: createBookingDto.pickupLatitude,
        longitude: createBookingDto.pickupLongitude,
        destinationLatitude: createBookingDto.destinationLatitude,
        destinationLongitude: createBookingDto.destinationLongitude,
        customerName: booking.customer ? booking.customer.name : 'Customer',
      });

      // Find nearby drivers
      try {
        const nearbyDriversResponse = await this.executeWithRetry(async () => {
          return await firstValueFrom(
            this.matchingServiceClient.send('findDrivers', {
              latitude: createBookingDto.pickupLatitude,
              longitude: createBookingDto.pickupLongitude,
              radius: 1, // 1km radius
            }),
          );
        });

        // Send notifications to nearby drivers
        if (nearbyDriversResponse && nearbyDriversResponse.drivers && nearbyDriversResponse.drivers.length > 0) {
          this.logger.log(`Found ${nearbyDriversResponse.drivers.length} nearby drivers for booking ${booking.id}`);

          const eligibleDriverIds = nearbyDriversResponse.drivers.map((driver: NearbyDriver) => driver.userId);
          await this.executeWithRetry(async () => {
            await this.redis.sadd(`booking:${booking.id}:eligible-drivers`, ...eligibleDriverIds);
            // Set expiry 2 hours (booking timeout)
            await this.redis.expire(`booking:${booking.id}:eligible-drivers`, 7200);
          });
          this.logger.log(`Stored ${eligibleDriverIds.length} eligible drivers for booking ${booking.id}`);

          nearbyDriversResponse.drivers.forEach((driver: NearbyDriver) => {
            this.notificationServiceClient.emit('booking.new', {
              bookingId: booking.id,
              driverId: driver.userId,
              customerId: userId,
              distance: driver.distance,
              pickupLocation: {
                latitude: createBookingDto.pickupLatitude,
                longitude: createBookingDto.pickupLongitude,
              },
            } as BookingNotification);
          });
        } else {
          this.logger.warn(`No nearby drivers found for booking ${booking.id}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to find nearby drivers: ${errorMessage}`, error);
      }

      return booking;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create booking: ${errorMessage}`, error);
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

      // Notify relevant parties
      this.notifyStatusUpdate(updatedBooking);

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to update booking status for ${bookingId}:`, error);
      throw error;
    }
  }

  async acceptBooking(bookingId: string, driverId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
        this.logger.warn(`Cannot accept booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(`Booking is already ${booking.status}`);
      }

      const isEligible = await this.isDriverEligibleForBooking(bookingId, driverId);
      if (!isEligible) {
        this.logger.warn(`Driver ${driverId} is not eligible to accept booking ${bookingId}`);

        // Log eligible drivers for debugging
        const eligibleDrivers = await this.getEligibleDrivers(bookingId);
        this.logger.warn(`Eligible drivers for booking ${bookingId}: [${eligibleDrivers.join(', ')}]`);

        throw new UnauthorizedException('You are not eligible to accept this booking. Only nearby drivers can accept.');
      }
      this.logger.log(`Driver ${driverId} is eligible to accept booking ${bookingId}`);

      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.ACCEPTED,
        driverId,
        acceptedAt: new Date(),
      });

      // Publish to messaging service
      await this.messagingService.publish(BookingEvents.ACCEPTED, {
        bookingId,
        customerId: booking.customerId,
        driverId,
        driverName: updatedBooking.driver?.name || 'Driver',
        driverLatitude: updatedBooking.driver?.driverProfile?.lastLatitude || 0,
        driverLongitude: updatedBooking.driver?.driverProfile?.lastLongitude || 0,
        estimatedArrivalTime: 0,
      });

      // Legacy notification for backward compatibility
      this.notificationServiceClient.emit('booking.accepted', {
        bookingId,
        customerId: booking.customerId,
        driverId,
      });

      // Clean up eligible drivers list setelah accepted
      try {
        await this.redis.del(`booking:${bookingId}:eligible-drivers`);
        this.logger.log(`Cleaned up eligible drivers list for accepted booking ${bookingId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to clean up eligible drivers list: ${errorMessage}`);
      }

      return updatedBooking;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to accept booking ${bookingId}: ${errorMessage}`, error);
      throw error;
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

      // Legacy notifications for backward compatibility
      if (userId === booking.customerId) {
        // Customer cancelled, notify driver if assigned
        if (booking.driverId) {
          this.notificationServiceClient.emit('booking.cancelled', {
            bookingId,
            driverId: booking.driverId,
            cancelledBy: 'customer',
          });
        }
      } else {
        // Driver cancelled, notify customer
        this.notificationServiceClient.emit('booking.cancelled', {
          bookingId,
          customerId: booking.customerId,
          cancelledBy: 'driver',
        });
      }

      // Clean up eligible drivers list
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

      // Legacy notification
      this.notificationServiceClient.emit('booking.completed', {
        bookingId: bookingId,
        customerId: updatedBooking.customerId,
        driverId: updatedBooking.driverId,
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

  private notifyStatusUpdate(booking: any) {
    const event = `booking.${booking.status.toLowerCase()}`;
    const payload = {
      bookingId: booking.id,
      customerId: booking.customerId,
      driverId: booking.driverId,
      status: booking.status,
    };

    this.notificationServiceClient.emit(event, payload);
    this.logger.log(`Notified ${event} for booking ${booking.id}`);
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
}
