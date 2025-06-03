import { Injectable, Inject, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TripRepository } from '@app/trip/repositories/trip.repository';
import { LocationService } from '@app/location/location.service';
import { StartTripDto } from '@app/trip/dto/start-trip.dto';
import { EndTripDto } from '@app/trip/dto/end-trip.dto';
import { UpdateTripLocationDto } from '@app/trip/dto/update-trip-location.dto';
import { TripGateway } from '@app/trip/trip.gateway';
import { EventPattern, MessagePattern, ClientProxy } from '@nestjs/microservices';
import { TripStatus, BookingStatus } from '@app/common';
import * as PriceConstant from '@app/common/constants/price.constant';
import { MessagingService } from '@app/messaging';
import { TripEvents } from '@app/messaging/events/event-types';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);
  private readonly PRICE_PER_KM = PriceConstant.PRICE_CONSTANTS.PRICE_PER_KM;
  private readonly PLATFORM_FEE_PERCENTAGE = PriceConstant.PRICE_CONSTANTS.PLATFORM_FEE_PERCENTAGE / 100; // 5%

  constructor(
    private readonly tripRepository: TripRepository,
    private readonly locationService: LocationService,
    private readonly tripGateway: TripGateway,
    @Inject('REDIS_CLIENT') private readonly redis: any,
    @Inject('BOOKING_SERVICE') private readonly bookingServiceClient: ClientProxy,
    @Inject('PAYMENT_SERVICE') private readonly paymentServiceClient: ClientProxy,
    private readonly messagingService: MessagingService
  ) { }

  async startTrip(driverId: string, startTripDto: StartTripDto) {
    try {
      this.logger.log(`Driver ${driverId} starting trip for booking ${startTripDto.bookingId}`);

      // Verify booking exists and is in ACCEPTED status
      const tripCheck = await this.tripRepository.findByBookingId(startTripDto.bookingId);
      if (tripCheck) {
        throw new BadRequestException('Trip already exists for this booking');
      }

      // Create new trip record
      const trip = await this.tripRepository.create({
        bookingId: startTripDto.bookingId,
        startTime: new Date(),
        distance: 0,
        basePrice: 0,
        discountAmount: 0,
        discountPercentage: 0,
        finalPrice: 0,
        platformFeePercentage: this.PLATFORM_FEE_PERCENTAGE * 100, // Convert to percentage
        platformFeeAmount: 0,
        driverAmount: 0,
        status: TripStatus.ONGOING,
      });

      // Initialize trip tracking in Redis
      await this.redis.set(
        `trip:${trip.id}`,
        JSON.stringify({
          tripId: trip.id,
          bookingId: startTripDto.bookingId,
          driverId,
          startTime: trip.startTime,
          locations: [],
          totalDistance: 0,
          lastUpdateTime: new Date().toISOString(),
        }),
        'EX',
        86400 // 24 hours expiry
      );

      // ⚡ Update booking status to ONGOING via message
      await firstValueFrom(
        this.bookingServiceClient.send('booking.updateStatus', {
          bookingId: startTripDto.bookingId,
          status: BookingStatus.ONGOING,
          startedAt: new Date()
        })
      );

      // Get booking details for event publishing
      const tripRecord = await this.tripRepository.findById(trip.id);
      const booking = tripRecord?.booking;
      const customerId = booking?.customerId;

      if (customerId && booking?.customerId) {
        // Publish trip started event
        await this.messagingService.publish(TripEvents.STARTED, {
          tripId: trip.id,
          bookingId: startTripDto.bookingId,
          driverId,
          customerId: booking.customerId,
          pickupLocation: {
            latitude: booking.pickupLat,
            longitude: booking.pickupLng
          }
        });
      }

      this.logger.log(`Trip started successfully: ${trip.id}`);
      return trip;
    } catch (error) {
      this.logger.error('Failed to start trip:', error);
      throw error;
    }
  }

  async updateTripLocation(tripId: string, userId: string, updateLocationDto: UpdateTripLocationDto) {
    try {
      // Get trip data from Redis
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (!tripData) {
        this.logger.warn(`Trip ${tripId} not found in Redis or has expired`);
        throw new NotFoundException('Trip not found or expired');
      }

      const trip = JSON.parse(tripData);

      // Verify driver authorization
      if (trip.driverId !== userId) {
        throw new UnauthorizedException('You are not authorized to update this trip location');
      }

      // Add new location
      const newLocation = {
        latitude: updateLocationDto.latitude,
        longitude: updateLocationDto.longitude,
        timestamp: new Date().toISOString(),
      };

      trip.locations.push(newLocation);
      trip.lastUpdateTime = new Date().toISOString();

      // Calculate distance from last location if exists
      if (trip.locations.length > 1) {
        const lastLocation = trip.locations[trip.locations.length - 2];
        this.logger.log(`Calculating distance from last location to new location`);
        const distance = this.calculateDistance(
          lastLocation.latitude,
          lastLocation.longitude,
          newLocation.latitude,
          newLocation.longitude
        );
        this.logger.log(`Distance calculated: ${distance} km`);

        // Only add distance if movement is significant (> 10 meters)
        if (distance > 0.01) {
          trip.totalDistance += distance;
        }
      }

      // Update Redis
      await this.redis.set(
        `trip:${tripId}`,
        JSON.stringify(trip),
        'EX',
        86400
      );

      // Update user's current location
      await this.locationService.updateLocation(
        userId,
        updateLocationDto.latitude,
        updateLocationDto.longitude
      );

      // Send real-time update via WebSocket
      this.tripGateway.sendLocationUpdate(tripId, {
        latitude: updateLocationDto.latitude,
        longitude: updateLocationDto.longitude,
        totalDistance: trip.totalDistance,
        timestamp: new Date().toISOString(),
      });

      // Get booking data to access customerId for messaging
      const tripRecord = await this.tripRepository.findById(tripId);
      if (tripRecord?.booking?.id && tripRecord?.booking?.customerId) {
        // Publish trip location update via messaging
        await this.messagingService.publish(TripEvents.UPDATED, {
          tripId,
          bookingId: tripRecord.booking.id,
          driverId: userId,
          customerId: tripRecord.booking.customerId,
          driverLatitude: updateLocationDto.latitude,
          driverLongitude: updateLocationDto.longitude,
        });
      }

      return {
        tripId,
        totalDistance: trip.totalDistance,
        currentLocation: newLocation,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update trip location: ${errorMessage}`, error);
      throw error;
    }
  }

  async endTrip(tripId: string, driverId: string, endTripDto: EndTripDto) {
    try {
      this.logger.log(`Driver ${driverId} ending trip ${tripId}`);

      // Get trip data from Redis
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (!tripData) {
        this.logger.warn(`Trip ${tripId} not found in Redis or has expired`);
        throw new NotFoundException('Trip not found or expired');
      }

      const trip = JSON.parse(tripData);

      // Verify driver authorization
      if (trip.driverId !== driverId) {
        throw new UnauthorizedException('You are not authorized to end this trip');
      }

      // Get trip record from database to access booking info
      const tripRecord = await this.tripRepository.findById(tripId);
      if (!tripRecord) {
        throw new NotFoundException('Trip record not found in database');
      }

      // Calculate final cost
      const costCalculation = this.calculateFinalCost(trip.totalDistance, endTripDto.discountPercentage || 0);

      // Update trip in database
      const updatedTrip = await this.tripRepository.update(tripId, {
        endTime: new Date(),
        distance: trip.totalDistance,
        basePrice: costCalculation.basePrice,
        discountAmount: costCalculation.discountAmount,
        discountPercentage: endTripDto.discountPercentage || 0,
        finalPrice: costCalculation.finalPrice,
        platformFeePercentage: this.PLATFORM_FEE_PERCENTAGE * 100,
        platformFeeAmount: costCalculation.platformFeeAmount,
        driverAmount: costCalculation.driverAmount,
        status: TripStatus.COMPLETED,
      });

      // ⚡ Complete booking via message
      await firstValueFrom(
        this.bookingServiceClient.send('booking.complete', {
          bookingId: tripRecord.bookingId,
          completedAt: new Date()
        })
      );

      // ⚡ Process payments
      try {
        if (!tripRecord.booking) {
          throw new Error('Booking information not found for this trip');
        }

        await firstValueFrom(
          this.paymentServiceClient.send('payment.processTrip', {
            bookingId: tripRecord.bookingId,
            tripId: tripId,
            customerId: tripRecord.booking.customerId,
            driverId: driverId,
            totalAmount: costCalculation.finalPrice,
            driverAmount: costCalculation.driverAmount,
            platformFee: costCalculation.platformFeeAmount,
            tripDistance: trip.totalDistance
          })
        );
        this.logger.log(`Payment processed successfully for trip ${tripId}`);
      } catch (paymentError) {
        this.logger.error(`Payment processing failed for trip ${tripId}:`, paymentError);
        // Note: Trip is still completed even if payment fails - will be handled by payment service
      }

      // Clean up Redis
      await this.redis.del(`trip:${tripId}`);

      // Send trip status update via WebSocket
      this.tripGateway.sendTripStatusUpdate(tripId, {
        status: 'COMPLETED',
        finalPrice: costCalculation.finalPrice,
        totalDistance: trip.totalDistance,
      });

      // Publish trip ended event
      if (tripRecord.booking?.customerId) {
        await this.messagingService.publish(TripEvents.ENDED, {
          tripId,
          bookingId: tripRecord.bookingId,
          driverId,
          customerId: tripRecord.booking.customerId,
          distance: trip.totalDistance,
          fare: costCalculation.finalPrice
        });
      }

      this.logger.log(`Trip ended successfully: ${tripId}, Distance: ${trip.totalDistance}km, Final price: ${costCalculation.finalPrice}`);

      return {
        ...updatedTrip,
        costBreakdown: costCalculation,
        tripSummary: {
          distance: trip.totalDistance,
          duration: this.calculateTripDuration(trip.startTime, new Date()),
          startTime: trip.startTime,
          endTime: new Date(),
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to end trip: ${errorMessage}`, error);
      throw error;
    }
  }

  async getTripDetails(tripId: string) {
    try {
      // First try to get from Redis (if trip is ongoing)
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (tripData) {
        const redisTrip = JSON.parse(tripData);
        return {
          ...redisTrip,
          status: 'ONGOING',
          estimatedCost: this.calculateFinalCost(redisTrip.totalDistance || 0).finalPrice
        };
      }

      // If not in Redis, get from database
      const trip = await this.tripRepository.findById(tripId);
      if (!trip) {
        this.logger.warn(`Trip ${tripId} not found in database`);
        throw new NotFoundException('Trip not found');
      }

      return trip;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get trip details: ${errorMessage}`, error);
      throw error;
    }
  }

  async calculateTripCost(tripId: string) {
    try {
      // Get trip data from Redis first
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (!tripData) {
        // Get from database if trip is completed
        const trip = await this.tripRepository.findById(tripId);
        if (!trip) {
          throw new NotFoundException('Trip not found');
        }

        return {
          distance: trip.distance,
          basePrice: trip.basePrice,
          finalPrice: trip.finalPrice,
          platformFeeAmount: trip.platformFeeAmount,
          driverAmount: trip.driverAmount,
        };
      }

      const trip = JSON.parse(tripData);
      const costCalculation = this.calculateFinalCost(trip.totalDistance || 0);

      return {
        distance: trip.totalDistance,
        basePrice: costCalculation.basePrice,
        estimatedFinalPrice: costCalculation.finalPrice,
        platformFeeAmount: costCalculation.platformFeeAmount,
        driverAmount: costCalculation.driverAmount,
        pricePerKm: this.PRICE_PER_KM,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to calculate trip cost for trip ${tripId}: ${errorMessage}`, error);
      throw error;
    }
  }

  async getUserTrips(userId: string) {
    try {
      // Get all trips for a user (both as driver and customer)
      const trips = await this.tripRepository.findByUserId(userId);

      return trips.map(trip => ({
        id: trip.id,
        bookingId: trip.bookingId,
        startTime: trip.startTime,
        endTime: trip.endTime,
        distance: trip.distance,
        finalPrice: trip.finalPrice,
        status: trip.status,
        role: trip.booking?.driverId === userId ? 'DRIVER' : 'CUSTOMER',
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get trips for user ${userId}: ${errorMessage}`, error);
      throw error;
    }
  }

  async getActiveTrips() {
    try {
      const activeTrips = await this.tripRepository.findActiveTrips();

      // Also get active trips from Redis
      const redisKeys = await this.redis.keys('trip:*');
      const redisTrips = [];

      for (const key of redisKeys) {
        const tripData = await this.redis.get(key);
        if (tripData) {
          redisTrips.push(JSON.parse(tripData));
        }
      }

      return {
        databaseTrips: activeTrips,
        redisTrips: redisTrips,
        total: activeTrips.length + redisTrips.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get active trips: ${errorMessage}`, error);
      throw error;
    }
  }

  async recoverIncompleteTrips() {
    try {
      const incompleteTrips = await this.tripRepository.findIncompleteTrips();
      const recoveredTrips = [];
      const failedRecoveries = [];

      for (const trip of incompleteTrips) {
        try {
          // Check if trip is still in Redis
          const redisData = await this.redis.get(`trip:${trip.id}`);

          if (redisData) {
            // Trip is still active in Redis
            const tripData = JSON.parse(redisData);
            const lastUpdateTime = new Date(tripData.lastUpdateTime || tripData.startTime);
            const timeDiff = Date.now() - lastUpdateTime.getTime();

            // If no update for more than 1 hour, consider it abandoned
            if (timeDiff > 3600000) {
              await this.forceEndTrip(trip.id, 'ABANDONED');
              recoveredTrips.push({ id: trip.id, status: 'FORCE_ENDED' });
            } else {
              recoveredTrips.push({ id: trip.id, status: 'STILL_ACTIVE' });
            }
          } else {
            // Trip not in Redis but incomplete in database
            await this.forceEndTrip(trip.id, 'SYSTEM_ERROR');
            recoveredTrips.push({ id: trip.id, status: 'FORCE_ENDED' });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          failedRecoveries.push({ id: trip.id, error: errorMessage });
        }
      }

      return {
        totalIncomplete: incompleteTrips.length,
        recovered: recoveredTrips,
        failed: failedRecoveries,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to recover incomplete trips: ${errorMessage}`, error);
      throw error;
    }
  }

  // ✅ Message handler for booking service (legacy compatibility)
  @MessagePattern('trip.calculateFinalCost')
  async calculateFinalCostMessage(data: { bookingId: string }) {
    try {
      // Find trip by booking ID
      const trip = await this.tripRepository.findByBookingId(data.bookingId);
      if (!trip) {
        throw new NotFoundException('No trip found for this booking');
      }

      // Use existing cost calculation method
      const costCalculation = await this.calculateTripCost(trip.id);

      return {
        bookingId: data.bookingId,
        totalDistance: costCalculation.distance,
        basePrice: costCalculation.basePrice,
        platformFeePercentage: this.PLATFORM_FEE_PERCENTAGE * 100,
        platformFeeAmount: costCalculation.platformFeeAmount,
        driverAmount: costCalculation.driverAmount,
        finalPrice: costCalculation.finalPrice || costCalculation.estimatedFinalPrice
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to calculate final cost for booking ${data.bookingId}: ${errorMessage}`, error);
      throw error;
    }
  }

  @MessagePattern('trip.getDistance')
  async getTripDistanceMessage(data: { bookingId: string }) {
    try {
      // First try to find trip in Redis by searching for booking ID
      const redisKeys = await this.redis.keys('trip:*');
      for (const key of redisKeys) {
        const tripData = await this.redis.get(key);
        if (tripData) {
          const trip = JSON.parse(tripData);
          if (trip.bookingId === data.bookingId) {
            return {
              bookingId: data.bookingId,
              totalDistanceKm: trip.totalDistance,
              locations: trip.locations.length
            };
          }
        }
      }

      // If not found in Redis, get from database
      const trip = await this.tripRepository.findByBookingId(data.bookingId);
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      return {
        bookingId: data.bookingId,
        totalDistanceKm: trip.distance,
        locations: 0 // Completed trips don't have location tracking data
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get trip distance for booking ${data.bookingId}: ${errorMessage}`, error);
      throw error;
    }
  }

  // ✅ Event handler for trip completion (legacy compatibility)
  @EventPattern('trip.complete')
  async handleTripCompleteEvent(data: { bookingId: string, tripDetails: any }) {
    try {
      const tripId = await this.findTripIdByBookingId(data.bookingId);
      if (!tripId) {
        this.logger.error(`No trip found for booking ${data.bookingId}`);
        return;
      }

      // Update trip in database with final data
      await this.tripRepository.update(tripId, {
        endTime: new Date(),
        status: TripStatus.COMPLETED,
        distance: data.tripDetails.totalDistance,
        basePrice: data.tripDetails.basePrice,
        finalPrice: data.tripDetails.finalPrice,
        platformFeePercentage: data.tripDetails.platformFeePercentage,
        platformFeeAmount: data.tripDetails.platformFeeAmount,
        driverAmount: data.tripDetails.driverAmount
      });

      // Clean up Redis
      await this.redis.del(`trip:${tripId}`);

      // Broadcast to WebSocket
      this.tripGateway.sendTripStatusUpdate(tripId, {
        status: 'COMPLETED',
        finalPrice: data.tripDetails.finalPrice,
        totalDistance: data.tripDetails.totalDistance
      });

      this.logger.log(`Trip completed for booking ${data.bookingId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle trip complete for booking ${data.bookingId}: ${errorMessage}`, error);
    }
  }

  // ============= PRIVATE HELPER METHODS =============

  private calculateFinalCost(distanceKm: number, discountPercentage: number = 0) {
    const basePrice = Math.ceil(distanceKm * this.PRICE_PER_KM);
    const discountAmount = (basePrice * discountPercentage) / 100;
    const finalPrice = basePrice - discountAmount;
    const platformFeeAmount = Math.ceil(finalPrice * this.PLATFORM_FEE_PERCENTAGE);
    const driverAmount = finalPrice - platformFeeAmount;

    return {
      basePrice,
      discountAmount,
      discountPercentage,
      finalPrice,
      platformFeeAmount,
      driverAmount
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private calculateTripDuration(startTime: string | Date, endTime: Date): string {
    const start = new Date(startTime);
    const durationMs = endTime.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
  }

  private async forceEndTrip(tripId: string, reason: string) {
    try {
      // Update trip status in database
      await this.tripRepository.update(tripId, {
        status: TripStatus.COMPLETED,
        endTime: new Date(),
      });

      // Clean up Redis data
      await this.redis.del(`trip:${tripId}`);

      this.logger.warn(`Trip ${tripId} force ended. Reason: ${reason}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to force end trip ${tripId}: ${errorMessage}`, error);
      throw error;
    }
  }

  private async findTripIdByBookingId(bookingId: string): Promise<string | null> {
    const trip = await this.tripRepository.findByBookingId(bookingId);
    return trip ? trip.id : null;
  }
}