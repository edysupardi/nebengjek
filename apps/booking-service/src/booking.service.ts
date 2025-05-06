import { Injectable, Inject, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { BookingRepository } from './repositories/booking.repository';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { ClientProxy } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { UserRole } from '@app/common/enums/user-role.enum';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly httpService: HttpService,
    @Inject('TRACKING_SERVICE') private trackingServiceClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE') private notificationServiceClient: ClientProxy,
    @Inject('REDIS_CLIENT') private redis: any
  ) {}

  async createBooking(userId: string, createBookingDto: CreateBookingDto) {
    try {
      this.logger.log(`Creating booking for user ${userId}`);
      
      // First check if user already has active booking
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

      // Store booking in Redis for matching service
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
        3600 // 1 hour expiry
      );

      // Find nearby drivers (This would be a call to Matching Service in real implementation)
      // For now, let's simulate by directly calling Tracking Service
      try {
        const nearbyDriversResponse = await firstValueFrom(
          this.httpService.post('http://localhost:3003/location/nearby-drivers', {
            latitude: createBookingDto.pickupLatitude,
            longitude: createBookingDto.pickupLongitude,
            radius: 1, // 1km radius
          })
        );
        
        const nearbyDrivers = nearbyDriversResponse.data;
        
        // Send notifications to nearby drivers
        if (nearbyDrivers && nearbyDrivers.length > 0) {
          nearbyDrivers.forEach((driver: { driverId: any; distance: any; }) => {
            this.notificationServiceClient.emit('booking.new', {
              bookingId: booking.id,
              driverId: driver.driverId,
              distance: driver.distance,
            });
          });
        }
      } catch (error) {
        this.logger.error('Failed to find nearby drivers:', error);
        // We don't throw here, as the booking should still be created
        // even if we can't find drivers immediately
      }

      return booking;
    } catch (error) {
      this.logger.error('Failed to create booking:', error);
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
      this.logger.log(`Total bookings found: ${total}`);
      
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

  async updateBookingStatus(bookingId: string, userId: string, status: BookingStatus) {
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
      const updatedBooking = await this.bookingRepository.update(bookingId, { status });

      // Notify relevant parties
      this.notifyStatusUpdate(updatedBooking);

      // If status is COMPLETED, trigger a trip completion in Tracking Service
      if (status === BookingStatus.COMPLETED) {
        // Implement trip completion logic
      }

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

      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.ACCEPTED,
        driverId,
      });

      // Notify customer that booking is accepted
      this.notificationServiceClient.emit('booking.accepted', {
        bookingId,
        customerId: booking.customerId,
        driverId,
      });

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to accept booking ${bookingId}:`, error);
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

      // Store driver rejection in Redis to avoid re-matching
      await this.redis.sadd(`booking:${bookingId}:rejected-drivers`, driverId);

      // Try to find another driver
      // This would be handled by Matching Service

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
      if (
        booking.status !== BookingStatus.PENDING &&
        booking.status !== BookingStatus.ACCEPTED
      ) {
        this.logger.warn(`Cannot cancel booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(
          `Cannot cancel booking with status ${booking.status}`
        );
      }

      // Verify that user is authorized to cancel
      if (booking.customerId !== userId && booking.driverId !== userId) {
        this.logger.warn(`User ${userId} is not authorized to cancel booking ${bookingId}`);
        throw new UnauthorizedException('You are not authorized to cancel this booking');
      }

      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.CANCELLED,
      });

      // Notify relevant parties
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

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to cancel booking ${bookingId}:`, error);
      throw error;
    }
  }

  async completeBooking(bookingId: string, driverId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        this.logger.warn(`Booking ${bookingId} not found`);
        throw new NotFoundException('Booking not found');
      }

      if (booking.driverId !== driverId) {
        this.logger.warn(`Driver ${driverId} is not authorized to complete booking ${bookingId}`);
        throw new UnauthorizedException('You are not the driver for this booking');
      }

      if (booking.status !== BookingStatus.ONGOING) {
        this.logger.warn(`Cannot complete booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(
          `Cannot complete booking with status ${booking.status}`
        );
      }

      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.COMPLETED,
      });

      // Notify customer that booking is completed
      this.notificationServiceClient.emit('booking.completed', {
        bookingId,
        customerId: booking.customerId,
      });

      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to complete booking ${bookingId}:`, error);
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
      if (
        booking.status !== BookingStatus.CANCELLED &&
        booking.status !== BookingStatus.COMPLETED
      ) {
        this.logger.warn(`Cannot delete booking ${bookingId} with status ${booking.status}`);
        throw new BadRequestException(
          `Cannot delete booking with status ${booking.status}`
        );
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

  private validateStatusTransition(
    currentStatus: BookingStatus | any,
    newStatus: BookingStatus | any,
    userId: string,
    booking: any
  ) {
    // Define valid transitions based on current status and user role
    const isCustomer = userId === booking.customerId;
    const isDriver = userId === booking.driverId;

    switch (currentStatus) {
      case BookingStatus.PENDING:
        // Customer can cancel, driver can accept or reject
        if (isCustomer && newStatus !== BookingStatus.CANCELLED) {
          this.logger.warn(
            `Customer can only cancel a pending booking, current status: ${currentStatus} new status: ${newStatus} userId: ${userId}`
          );
          throw new BadRequestException('Customer can only cancel a pending booking');
        }
        if (isDriver && ![BookingStatus.ACCEPTED, BookingStatus.REJECTED].includes(newStatus)) {
          this.logger.warn(
            `Driver can only accept or reject a pending booking, current status: ${currentStatus} new status: ${newStatus} userId: ${userId}`
          );
          throw new BadRequestException('Driver can only accept or reject a pending booking');
        }
        break;
      case BookingStatus.ACCEPTED:
        // Both can cancel, driver can start trip (ONGOING)
        if (isCustomer && newStatus !== BookingStatus.CANCELLED) {
          this.logger.warn(
            `Customer can only cancel an accepted booking, current status: ${currentStatus} new status: ${newStatus} userId: ${userId}`
          );
          throw new BadRequestException('Customer can only cancel an accepted booking');
        }
        if (isDriver && ![BookingStatus.CANCELLED, BookingStatus.ONGOING].includes(newStatus)) {
          this.logger.warn(
            `Driver can only cancel or start an accepted booking, current status: ${currentStatus} new status: ${newStatus} userId: ${userId}`
          );
          throw new BadRequestException('Driver can only cancel or start an accepted booking');
        }
        break;
      case BookingStatus.ONGOING:
        // Only driver can complete
        if (!isDriver || newStatus !== BookingStatus.COMPLETED) {
          this.logger.warn(
            `Only driver can complete an ongoing booking, current status: ${currentStatus} new status: ${newStatus} userId: ${userId}`
          );
          throw new BadRequestException('Only the driver can complete an ongoing booking');
        }
        break;
      case BookingStatus.COMPLETED:
      case BookingStatus.CANCELLED:
      case BookingStatus.REJECTED:
        // No further status changes allowed
        this.logger.warn(
          `Cannot change status of a completed/cancelled/rejected booking, current status: ${currentStatus} new status: ${newStatus} userId: ${userId}`
        );
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
}