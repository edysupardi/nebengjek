import { Injectable, Inject, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { BookingRepository } from './repositories/booking.repository';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { ClientProxy } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { BookingNotification, NearbyDriver } from '@app/common';
import * as PriceConstant from '@app/common/constants/price.constant';
import { MessagingService } from '@app/messaging';
import { BookingEvents } from '@app/messaging/events/event-types';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly httpService: HttpService,
    @Inject('TRACKING_SERVICE') private trackingServiceClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE') private notificationServiceClient: ClientProxy,
    @Inject('MATCHING_SERVICE') private matchingServiceClient: ClientProxy,
    @Inject('REDIS_CLIENT') private redis: any,
    private readonly messagingService: MessagingService
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
          3600 // 1 hour expiry
        );
      });

      // Publish booking.created event through messaging service
      await this.messagingService.publish(BookingEvents.CREATED, {
        bookingId: booking.id,
        customerId: userId,
        latitude: createBookingDto.pickupLatitude,
        longitude: createBookingDto.pickupLongitude,
        destinationLatitude: createBookingDto.destinationLatitude,
        destinationLongitude: createBookingDto.destinationLongitude,
        customerName: booking.customer ? booking.customer.name : 'Customer',
      });
  
      // Find nearby drivers with retry - keep this for legacy compatibility
      try {
        const nearbyDriversResponse = await this.executeWithRetry(async () => {
          return await firstValueFrom(
            this.matchingServiceClient.send('findDrivers', {
              latitude: createBookingDto.pickupLatitude,
              longitude: createBookingDto.pickupLongitude,
              radius: 1 // 1km radius
            })
          );
        });
        
        // Send notifications to nearby drivers through legacy service
        if (nearbyDriversResponse && nearbyDriversResponse.drivers && nearbyDriversResponse.drivers.length > 0) {
          nearbyDriversResponse.drivers.forEach((driver: NearbyDriver) => {
            this.notificationServiceClient.emit('booking.new', {
              bookingId: booking.id,
              driverId: driver.driverId,
              distance: driver.distance,
            } as BookingNotification);
          });
        } else {
          this.logger.warn(`No nearby drivers found for booking ${booking.id}`);
        }
      } catch (error) {
        this.logger.error('Failed to find nearby drivers:', error);
        // We still return the booking even if we can't find drivers
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
        acceptedAt: new Date() // Timestamp when booking was accepted
      });

      // Publish to messaging service
      await this.messagingService.publish(BookingEvents.ACCEPTED, {
        bookingId,
        customerId: booking.customerId,
        driverId,
        driverName: updatedBooking.driver?.name || 'Driver',
        driverLatitude: updatedBooking.driver?.driverProfile?.lastLatitude || 0,
        driverLongitude: updatedBooking.driver?.driverProfile?.lastLongitude || 0,
        estimatedArrivalTime: 0 // Calculate ETA if possible
      });
  
      // Keep legacy notification for backward compatibility
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
  
      // Update booking with rejected timestamp
      await this.bookingRepository.update(bookingId, {
        rejectedAt: new Date()
      });
  
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
        cancelledAt: new Date() // Timestamp when booking was cancelled
      });

      // Determine who cancelled the booking
      const cancelledBy = userId === booking.customerId ? 'customer' : 'driver';
  
      // Publish to messaging service
      await this.messagingService.publish(BookingEvents.CANCELLED, {
        bookingId,
        customerId: booking.customerId,
        driverId: booking.driverId ?? undefined,
        cancelledBy
      });
  
      // Keep legacy notifications for backward compatibility
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

  async startTrip(bookingId: string, driverId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      
      if (booking.driverId !== driverId) {
        throw new UnauthorizedException('You are not the driver for this booking');
      }
      
      if (booking.status !== BookingStatus.ACCEPTED) {
        throw new BadRequestException(`Cannot start trip with status ${booking.status}`);
      }
      
      // Update status to ONGOING and add timestamp
      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.ONGOING,
        startedAt: new Date()
      });
      
      // Kirim perintah ke tracking service untuk mulai tracking
      await firstValueFrom(
        this.trackingServiceClient.emit('trip.start', {
          bookingId: bookingId,
          driverId: driverId,
          customerId: booking.customerId,
          pickupLocation: {
            latitude: booking.pickupLat,
            longitude: booking.pickupLng
          }
        })
      );
      
      return updatedBooking;
    } catch (error) {
      this.logger.error(`Failed to start trip for booking ${bookingId}:`, error);
      throw error;
    }
  }

  async calculateFinalPrice(bookingId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking || booking.status !== BookingStatus.ONGOING) {
        throw new BadRequestException('No active booking found');
      }
      
      // Dapatkan total jarak dari tracking service
      const tripDataResponse = await firstValueFrom(
        this.trackingServiceClient.send('trip.getDistance', {
          bookingId: bookingId
        })
      );
      
      const distanceInKm = tripDataResponse.totalDistanceKm;

      const pricePerKm = PriceConstant.PRICE_CONSTANTS.PRICE_PER_KM; // in IDR
      const calculatedPrice = Math.round(distanceInKm * pricePerKm);

      // Hitung fee platform (5%)
      const platformFeePercentage = PriceConstant.PRICE_CONSTANTS.PLATFORM_FEE_PERCENTAGE / 100;
      const platformFee = Math.round(calculatedPrice * platformFeePercentage);
      const driverAmount = calculatedPrice - platformFee;
      
      // Simpan data harga sementara di Redis (belum final)
      await this.redis.set(
        `booking:${bookingId}:price`,
        JSON.stringify({
          distanceKm: distanceInKm,
          basePrice: calculatedPrice,
          platformFee: platformFee,
          driverAmount: driverAmount,
          timestamp: new Date().toISOString()
        }),
        'EX',
        3600 // 1 hour expiry
      );
      
      return {
        bookingId,
        distanceKm: distanceInKm,
        calculatedPrice,
        platformFee,
        driverAmount
      };
    } catch (error) {
      this.logger.error(`Failed to calculate price for booking ${bookingId}:`, error);
      throw error;
    }
  }

  async completeBooking(bookingId: string, driverId: string) {
    try {
      const booking = await this.bookingRepository.findById(bookingId);
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
  
      if (booking.driverId !== driverId) {
        throw new UnauthorizedException('You are not the driver for this booking');
      }
  
      if (booking.status !== BookingStatus.ONGOING) {
        throw new BadRequestException(
          `Cannot complete booking with status ${booking.status}`
        );
      }
      
      // Dapatkan kalkulasi harga dari tracking service
      const tripDataResponse = await firstValueFrom(
        this.trackingServiceClient.send('trip.calculateFinalCost', {
          bookingId: bookingId
        })
      );
      
      // Update booking ke COMPLETED dengan timestamp
      const updatedBooking = await this.bookingRepository.update(bookingId, {
        status: BookingStatus.COMPLETED,
        completedAt: new Date()
      });
  
      // Kirim notifikasi ke customer
      this.notificationServiceClient.emit('booking.completed', {
        bookingId,
        customerId: booking.customerId,
        tripDetails: tripDataResponse
      });
      
      // Notify tracking service to stop tracking and update trip data
      this.trackingServiceClient.emit('trip.complete', {
        bookingId,
        tripDetails: tripDataResponse
      });
  
      return {
        ...updatedBooking,
        tripDetails: tripDataResponse
      };
    } catch (error) {
      this.logger.error(`Failed to complete booking ${bookingId}:`, error);
      throw error;
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> {
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
          // Exponential backoff
          delay *= 2;
        }
      }
    }
    throw lastError;
  }
}