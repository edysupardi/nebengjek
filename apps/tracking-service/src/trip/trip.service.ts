import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { TripRepository } from '@app/trip/repositories/trip.repository';
import { LocationService } from '@app/location/location.service';
import { StartTripDto } from '@app/trip/dto/start-trip.dto';
import { EndTripDto } from '@app/trip/dto/end-trip.dto';
import { UpdateTripLocationDto } from '@app/trip/dto/update-trip-location.dto';
import { TripGateway } from '@app/trip/trip.gateway';

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);
  private readonly PRICE_PER_KM = 3000;
  private readonly ADMIN_FEE_PERCENTAGE = 0.05;

  constructor(
    private readonly tripRepository: TripRepository,
  private readonly locationService: LocationService,
  private readonly tripGateway: TripGateway, // Add this
  @Inject('REDIS_CLIENT') private readonly redis: any
  ) {}

  async startTrip(driverId: string, startTripDto: StartTripDto) {
    try {
      // Create new trip record
      const trip = await this.tripRepository.create({
        bookingId: startTripDto.bookingId,
        startTime: new Date(),
        status: 'ONGOING',
      });

      // Initialize trip tracking in Redis
      await this.redis.set(
        `trip:${trip.id}`,
        JSON.stringify({
          tripId: trip.id,
          driverId,
          startTime: trip.startTime,
          locations: [],
          totalDistance: 0,
        }),
        'EX',
        86400 // 24 hours expiry
      );      

      this.logger.log(`Trip started: ${trip.id}`);
      return trip;
    } catch (error) {
      this.logger.error('Failed to start trip:', error);
      throw error;
    }
  }

  /**
   * Updates the location of a trip and calculates the total distance traveled.
   * 
   * @param tripId - The unique identifier of the trip
   * @param userId - The unique identifier of the user associated with the trip
   * @param updateLocationDto - DTO containing the new location coordinates
   * @returns An object containing tripId, total distance traveled, and current location
   * 
   * @throws {NotFoundException} When trip is not found in Redis or has expired
   * 
   * This method:
   * 1. Retrieves trip data from Redis
   * 2. Adds new location to trip's location history
   * 3. Calculates distance from previous location if it exists
   * 4. Updates total distance if movement >= 1km
   * 5. Updates Redis with new trip data
   * 6. Updates user's current location
   * 7. Broadcasts location update via WebSocket
   */
  async updateTripLocation(tripId: string, userId: string, updateLocationDto: UpdateTripLocationDto) {
    try {
      // Get trip data from Redis
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (!tripData) {
        throw new NotFoundException('Trip not found or expired');
      }

      const trip = JSON.parse(tripData);
      
      // Add new location
      const newLocation = {
        latitude: updateLocationDto.latitude,
        longitude: updateLocationDto.longitude,
        timestamp: new Date().toISOString(),
      };

      trip.locations.push(newLocation);

      // Calculate distance from last location if exists
      if (trip.locations.length > 1) {
        const lastLocation = trip.locations[trip.locations.length - 2];
        const distance = this.calculateDistance(
          lastLocation.latitude,
          lastLocation.longitude,
          newLocation.latitude,
          newLocation.longitude
        );

        // Only add to total distance if moved at least 1km
        if (distance >= 1) {
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

      // Also update user's current location
      await this.locationService.updateLocation(
        userId,
        updateLocationDto.latitude,
        updateLocationDto.longitude
      );

      // Send real-time update via WebSocket - ADD THIS
      this.tripGateway.sendLocationUpdate(tripId, {
        latitude: updateLocationDto.latitude,
        longitude: updateLocationDto.longitude,
        totalDistance: trip.totalDistance,
        timestamp: new Date().toISOString(),
      });

      return {
        tripId,
        totalDistance: trip.totalDistance,
        currentLocation: newLocation,
      };
    } catch (error) {
      this.logger.error('Failed to update trip location:', error);
      throw error;
    }
  }

  async endTrip(tripId: string, driverId: string, endTripDto: EndTripDto) {
    try {
      // Get trip data from Redis
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (!tripData) {
        throw new NotFoundException('Trip not found or expired');
      }

      const trip = JSON.parse(tripData);
      
      // Calculate final cost
      const baseCost = Math.floor(trip.totalDistance) * this.PRICE_PER_KM;
      const finalPrice = baseCost * (endTripDto.discountPercentage / 100);
      const adminFee = finalPrice * this.ADMIN_FEE_PERCENTAGE;
      const driverEarnings = finalPrice - adminFee;

      // Update trip in database
      const updatedTrip = await this.tripRepository.update(tripId, {
        endTime: new Date(),
        distance: trip.totalDistance,
        price: baseCost,
        discount: baseCost - finalPrice,
        finalPrice: finalPrice,
        status: 'COMPLETED',
      });

      // Clean up Redis
      await this.redis.del(`trip:${tripId}`);

      this.tripGateway.sendTripStatusUpdate(tripId, {
        status: 'COMPLETED',
        finalPrice: finalPrice,
        totalDistance: trip.totalDistance,
      });

      this.logger.log(`Trip ended: ${tripId}, Total distance: ${trip.totalDistance}km, Final price: ${finalPrice}`);

      return {
        ...updatedTrip,
        adminFee,
        driverEarnings,
      };
    } catch (error) {
      this.logger.error('Failed to end trip:', error);
      throw error;
    }
  }

  async getTripDetails(tripId: string) {
    try {
      // First try to get from Redis (if trip is ongoing)
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (tripData) {
        return {
          ...JSON.parse(tripData),
          status: 'ONGOING',
        };
      }

      // If not in Redis, get from database
      const trip = await this.tripRepository.findById(tripId);
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      return trip;
    } catch (error) {
      this.logger.error('Failed to get trip details:', error);
      throw error;
    }
  }

  async calculateTripCost(tripId: string) {
    try {
      const tripData = await this.redis.get(`trip:${tripId}`);
      if (!tripData) {
        // Get from database if trip is completed
        const trip = await this.tripRepository.findById(tripId);
        if (!trip) {
          throw new NotFoundException('Trip not found');
        }

        return {
          distance: trip.distance,
          baseCost: trip.price,
          finalPrice: trip.finalPrice,
          adminFee: trip.finalPrice * this.ADMIN_FEE_PERCENTAGE,
          driverEarnings: trip.finalPrice * (1 - this.ADMIN_FEE_PERCENTAGE),
        };
      }

      const trip = JSON.parse(tripData);
      const baseCost = Math.floor(trip.totalDistance) * this.PRICE_PER_KM;

      return {
        distance: trip.totalDistance,
        baseCost: baseCost,
        estimatedFinalPrice: baseCost,
        pricePerKm: this.PRICE_PER_KM,
      };
    } catch (error) {
      this.logger.error('Failed to calculate trip cost:', error);
      throw error;
    }
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

  /**
   * Retrieves all trips associated with a specific user, whether as a driver or customer.
   * The function transforms the raw trip data to include the user's role in each trip.
   *
   * @param userId - The unique identifier of the user whose trips are being retrieved
   * @returns Promise<Array> - A promise that resolves to an array of trip objects containing:
   *   - id: The trip's unique identifier
   *   - bookingId: The associated booking identifier
   *   - startTime: The trip's start timestamp
   *   - endTime: The trip's end timestamp
   *   - distance: The total distance of the trip
   *   - finalPrice: The final price charged for the trip
   *   - status: The current status of the trip
   *   - role: The user's role in the trip (either 'DRIVER' or 'CUSTOMER')
   * @throws Will throw and log an error if the database query fails
   */
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
      this.logger.error(`Failed to get trips for user ${userId}:`, error);
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
      
      // Combine database and Redis data
      return {
        databaseTrips: activeTrips,
        redisTrips: redisTrips,
        total: activeTrips.length + redisTrips.length,
      };
    } catch (error) {
      this.logger.error('Failed to get active trips:', error);
      throw error;
    }
  }
  
  /**
   * Recovers and processes incomplete trips in the system.
   * This method identifies trips that are in an incomplete state and attempts to resolve their status.
   * 
   * The recovery process includes:
   * 1. Finding all incomplete trips from the database
   * 2. Checking each trip's status in Redis
   * 3. Processing trips based on their current state:
   *    - For trips still in Redis:
   *      - If no updates for > 1 hour: Marks as ABANDONED
   *      - Otherwise: Keeps as STILL_ACTIVE
   *    - For trips not in Redis: Marks as SYSTEM_ERROR
   * 
   * @throws {Error} If the recovery process fails
   * @returns {Promise<{
   *   totalIncomplete: number,
   *   recovered: Array<{ id: string, status: 'FORCE_ENDED' | 'STILL_ACTIVE' }>,
   *   failed: Array<{ id: string, error: string }>
   * }>} Object containing:
   *   - totalIncomplete: Total number of incomplete trips found
   *   - recovered: Array of successfully processed trips with their new status
   *   - failed: Array of trips that couldn't be processed, with error details
   */
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
            // Trip is still active in Redis, might be ongoing
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
      this.logger.error('Failed to recover incomplete trips:', error);
      throw error;
    }
  }
  
  private async forceEndTrip(tripId: string, reason: string) {
    try {
      // Update trip status in database
      await this.tripRepository.update(tripId, {
        status: 'COMPLETED',
        endTime: new Date(),
        // notes: `Force ended by system. Reason: ${reason}`,
      });
  
      // Clean up Redis data
      await this.redis.del(`trip:${tripId}`);
      
      this.logger.warn(`Trip ${tripId} force ended. Reason: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to force end trip ${tripId}:`, error);
      throw error;
    }
  }
}