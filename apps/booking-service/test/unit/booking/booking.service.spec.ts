import { BookingService } from '@app/booking/booking.service';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { BookingRepository } from '@app/booking/repositories/booking.repository';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { MessagingService } from '@app/messaging';
import { BookingEvents } from '@app/messaging/events/event-types';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('BookingService', () => {
  let service: BookingService;
  let bookingRepository: jest.Mocked<BookingRepository>;
  let httpService: jest.Mocked<HttpService>;
  let notificationServiceClient: jest.Mocked<ClientProxy>;
  let matchingServiceClient: jest.Mocked<ClientProxy>;
  let trackingServiceClient: jest.Mocked<ClientProxy>;
  let redisClient: jest.Mocked<any>;
  let messagingService: jest.Mocked<MessagingService>;

  const mockBooking = {
    id: 'booking-123',
    customerId: 'customer-123',
    driverId: 'driver-123',
    pickupLat: -6.2088,
    pickupLng: 106.8456,
    destinationLat: -6.1944,
    destinationLng: 106.8229,
    status: BookingStatus.PENDING,
    createdAt: new Date(),
    acceptedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    startedAt: null,
    completedAt: null,
    customer: {
      id: 'customer-123',
      name: 'John Doe',
      phone: '+6281234567890',
    },
    driver: {
      id: 'driver-123',
      name: 'Driver Name',
      phone: '+6281234567891',
      driverProfile: {
        rating: 4.5,
        vehicleType: 'motorcycle',
        lastLatitude: -6.2088,
        lastLongitude: 106.8456,
      },
    },
  };

  const mockCreateBookingDto: CreateBookingDto = {
    pickupLatitude: -6.2088,
    pickupLongitude: 106.8456,
    destinationLatitude: -6.1944,
    destinationLongitude: 106.8229,
  };

  beforeEach(async () => {
    const mockBookingRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByUser: jest.fn(),
      countByUser: jest.fn(),
      findActiveBookingByCustomer: jest.fn(),
      findActiveBookingByDriver: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      updateWithCondition: jest.fn(),
    };

    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const mockClientProxy = {
      send: jest.fn(),
      emit: jest.fn(),
    };

    const mockRedisClient = {
      hset: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      sismember: jest.fn(),
      smembers: jest.fn(),
      sadd: jest.fn(),
    };

    const mockMessagingService = {
      publish: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        {
          provide: BookingRepository,
          useValue: mockBookingRepository,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: 'NOTIFICATION_SERVICE',
          useValue: mockClientProxy,
        },
        {
          provide: 'MATCHING_SERVICE',
          useValue: mockClientProxy,
        },
        {
          provide: 'TRACKING_SERVICE',
          useValue: mockClientProxy,
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedisClient,
        },
        {
          provide: MessagingService,
          useValue: mockMessagingService,
        },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
    bookingRepository = module.get(BookingRepository);
    httpService = module.get(HttpService);
    notificationServiceClient = module.get('NOTIFICATION_SERVICE');
    matchingServiceClient = module.get('MATCHING_SERVICE');
    trackingServiceClient = module.get('TRACKING_SERVICE');
    redisClient = module.get('REDIS_CLIENT');
    messagingService = module.get(MessagingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    it('should create booking successfully', async () => {
      // Arrange
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockResolvedValue('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');
      messagingService.publish.mockResolvedValue(undefined);

      // Act
      const result = await service.createBooking('customer-123', mockCreateBookingDto);

      // Assert
      expect(result).toEqual(mockBooking);
      expect(bookingRepository.findActiveBookingByCustomer).toHaveBeenCalledWith('customer-123');
      expect(bookingRepository.create).toHaveBeenCalledWith({
        customerId: 'customer-123',
        pickupLat: mockCreateBookingDto.pickupLatitude,
        pickupLng: mockCreateBookingDto.pickupLongitude,
        destinationLat: mockCreateBookingDto.destinationLatitude,
        destinationLng: mockCreateBookingDto.destinationLongitude,
        status: BookingStatus.PENDING,
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CREATED, expect.any(Object));
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.DRIVER_SEARCH_REQUESTED, expect.any(Object));
    });

    it('should throw BadRequestException if customer already has active booking', async () => {
      // Arrange
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(mockBooking as any);

      // Act & Assert
      await expect(service.createBooking('customer-123', mockCreateBookingDto)).rejects.toThrow(BadRequestException);
      expect(bookingRepository.findActiveBookingByCustomer).toHaveBeenCalledWith('customer-123');
      expect(bookingRepository.create).not.toHaveBeenCalled();
    });

    it('should handle Redis errors with retry', async () => {
      // Arrange
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockRejectedValueOnce(new Error('Redis error')).mockResolvedValueOnce('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');
      messagingService.publish.mockResolvedValue(undefined);

      // Act
      const result = await service.createBooking('customer-123', mockCreateBookingDto);

      // Assert
      expect(result).toEqual(mockBooking);
      expect(redisClient.hset).toHaveBeenCalledTimes(2);
    });

    it('should throw error if repository create fails', async () => {
      // Arrange
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.createBooking('customer-123', mockCreateBookingDto)).rejects.toThrow('Database error');
    });
  });

  describe('getBookingDetails', () => {
    it('should return booking details successfully', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);

      // Act
      const result = await service.getBookingDetails('booking-123');

      // Assert
      expect(result).toEqual(mockBooking);
      expect(bookingRepository.findById).toHaveBeenCalledWith('booking-123');
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getBookingDetails('nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findById.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getBookingDetails('booking-123')).rejects.toThrow('Database error');
    });
  });

  describe('getUserBookings', () => {
    it('should return user bookings with pagination', async () => {
      // Arrange
      const mockBookings = [mockBooking];
      bookingRepository.findByUser.mockResolvedValue(mockBookings as any);
      bookingRepository.countByUser.mockResolvedValue(1);

      // Act
      const result = await service.getUserBookings('user-123', BookingStatus.PENDING, 1, 10);

      // Assert
      expect(result).toEqual({
        data: mockBookings,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          pages: 1,
        },
      });
      expect(bookingRepository.findByUser).toHaveBeenCalledWith('user-123', BookingStatus.PENDING, 0, 10);
      expect(bookingRepository.countByUser).toHaveBeenCalledWith('user-123', BookingStatus.PENDING);
    });

    it('should use default pagination values', async () => {
      // Arrange
      const mockBookings = [mockBooking];
      bookingRepository.findByUser.mockResolvedValue(mockBookings as any);
      bookingRepository.countByUser.mockResolvedValue(1);

      // Act
      const result = await service.getUserBookings('user-123');

      // Assert
      expect(bookingRepository.findByUser).toHaveBeenCalledWith('user-123', undefined, 0, 10);
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findByUser.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getUserBookings('user-123')).rejects.toThrow('Database error');
    });
  });

  describe('updateBookingStatus', () => {
    it('should update booking status successfully', async () => {
      // Arrange
      const updatedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await service.updateBookingStatus('booking-123', 'customer-123', BookingStatus.ACCEPTED);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(bookingRepository.findById).toHaveBeenCalledWith('booking-123');
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.ACCEPTED,
        acceptedAt: expect.any(Date),
      });
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateBookingStatus('nonexistent-booking', 'user-123', BookingStatus.ACCEPTED),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException if user not authorized', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);

      // Act & Assert
      await expect(
        service.updateBookingStatus('booking-123', 'unauthorized-user', BookingStatus.ACCEPTED),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should validate status transitions', async () => {
      // Arrange
      const completedBooking = { ...mockBooking, status: BookingStatus.COMPLETED };
      bookingRepository.findById.mockResolvedValue(completedBooking as any);

      // Act & Assert
      await expect(service.updateBookingStatus('booking-123', 'customer-123', BookingStatus.PENDING)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptBooking', () => {
    it('should accept booking successfully', async () => {
      // Arrange
      const lockKey = 'lock:booking:booking-123:accept';
      redisClient.set.mockResolvedValue('OK'); // Lock acquired
      redisClient.sismember.mockResolvedValue(1); // Driver is eligible
      redisClient.del.mockResolvedValue(1);

      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.updateWithCondition.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      } as any);

      // Mock hasActiveBooking to return false
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));

      messagingService.publish.mockResolvedValue(undefined);

      // Act
      const result = await service.acceptBooking('booking-123', 'driver-123');

      // Assert
      expect(result.status).toBe(BookingStatus.ACCEPTED);
      expect(redisClient.set).toHaveBeenCalledWith(lockKey, 'driver-123', 'PX', 10000, 'NX');
      expect(bookingRepository.updateWithCondition).toHaveBeenCalled();
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.ACCEPTED, expect.any(Object));
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.TAKEN, expect.any(Object));
    });

    it('should throw BadRequestException if lock cannot be acquired', async () => {
      // Arrange
      redisClient.set.mockResolvedValue(null); // Lock not acquired

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if driver has active booking', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK'); // Lock acquired
      redisClient.del.mockResolvedValue(1);

      // Mock hasActiveBooking to return true
      bookingRepository.findFirst.mockResolvedValue({ id: 'active-booking' } as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not PENDING', async () => {
      // Arrange
      const acceptedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if driver not eligible', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      redisClient.sismember.mockResolvedValue(0); // Driver not eligible
      redisClient.smembers.mockResolvedValue(['other-driver']);

      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));
      bookingRepository.findById.mockResolvedValue(mockBooking as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if updateWithCondition returns null', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      redisClient.sismember.mockResolvedValue(1);

      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.updateWithCondition.mockResolvedValue(null);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectBooking', () => {
    it('should reject booking successfully', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockResolvedValue(mockBooking as any);
      redisClient.sadd.mockResolvedValue(1);
      redisClient.smembers.mockResolvedValue(['driver-123']);
      redisClient.smembers.mockResolvedValue(['driver-123']);

      // Act
      const result = await service.rejectBooking('booking-123', 'driver-123');

      // Assert
      expect(result).toEqual({ message: 'Booking rejected successfully' });
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        rejectedAt: expect.any(Date),
      });
      expect(redisClient.sadd).toHaveBeenCalledWith('booking:booking-123:rejected-drivers', 'driver-123');
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.rejectBooking('booking-123', 'driver-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not PENDING', async () => {
      // Arrange
      const acceptedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act & Assert
      await expect(service.rejectBooking('booking-123', 'driver-123')).rejects.toThrow(BadRequestException);
    });

    it('should handle auto-cancel when all drivers rejected', async () => {
      // Arrange
      process.env.BOOKING_AUTO_CANCEL_ENABLED = 'true';
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockResolvedValue(mockBooking as any);
      redisClient.sadd.mockResolvedValue(1);
      redisClient.smembers
        .mockResolvedValueOnce(['driver-123']) // eligible drivers
        .mockResolvedValueOnce(['driver-123']); // rejected drivers

      // Mock smartCancelBooking
      jest.spyOn(service, 'smartCancelBooking').mockResolvedValue(undefined);

      // Act
      const result = await service.rejectBooking('booking-123', 'driver-123');

      // Assert
      expect(result).toEqual({ message: 'Booking rejected successfully' });
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking successfully by customer', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED } as any);
      messagingService.publish.mockResolvedValue(undefined);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.cancelBooking('booking-123', 'customer-123');

      // Assert
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.CANCELLED,
        cancelledAt: expect.any(Date),
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: 'customer-123',
        driverId: 'driver-123',
        cancelledBy: 'customer',
      });
    });

    it('should cancel booking successfully by driver', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED } as any);
      messagingService.publish.mockResolvedValue(undefined);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.cancelBooking('booking-123', 'driver-123');

      // Assert
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: 'customer-123',
        driverId: 'driver-123',
        cancelledBy: 'driver',
      });
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.cancelBooking('booking-123', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not cancellable', async () => {
      // Arrange
      const completedBooking = { ...mockBooking, status: BookingStatus.COMPLETED };
      bookingRepository.findById.mockResolvedValue(completedBooking as any);

      // Act & Assert
      await expect(service.cancelBooking('booking-123', 'customer-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if user not authorized', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);

      // Act & Assert
      await expect(service.cancelBooking('booking-123', 'unauthorized-user')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deleteBooking', () => {
    it('should delete booking successfully', async () => {
      // Arrange
      const cancelledBooking = { ...mockBooking, status: BookingStatus.CANCELLED };
      bookingRepository.findById.mockResolvedValue(cancelledBooking as any);
      bookingRepository.delete.mockResolvedValue(undefined);

      // Act
      const result = await service.deleteBooking('booking-123', 'customer-123');

      // Assert
      expect(result).toEqual({ message: 'Booking deleted successfully' });
      expect(bookingRepository.delete).toHaveBeenCalledWith('booking-123');
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'customer-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not deletable', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'customer-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if user is not customer', async () => {
      // Arrange
      const cancelledBooking = { ...mockBooking, status: BookingStatus.CANCELLED };
      bookingRepository.findById.mockResolvedValue(cancelledBooking as any);

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'driver-123')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('completeBookingFromTrip', () => {
    it('should complete booking from trip service successfully', async () => {
      // Arrange
      const completedAt = new Date();
      const completedBooking = { ...mockBooking, status: BookingStatus.COMPLETED, completedAt };
      bookingRepository.update.mockResolvedValue(completedBooking as any);
      messagingService.publish.mockResolvedValue(undefined);

      // Act
      const result = await service.completeBookingFromTrip('booking-123', completedAt);

      // Assert
      expect(result).toEqual(completedBooking);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.COMPLETED,
        completedAt: completedAt,
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.COMPLETED, expect.any(Object));
    });

    it('should handle repository errors', async () => {
      // Arrange
      const completedAt = new Date();
      bookingRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.completeBookingFromTrip('booking-123', completedAt)).rejects.toThrow('Database error');
    });
  });

  describe('checkMultipleDriversAvailability', () => {
    it('should check multiple drivers availability successfully', async () => {
      // Arrange
      const driverIds = ['driver-1', 'driver-2', 'driver-3'];
      const activeBookings = [{ driverId: 'driver-2', status: BookingStatus.ACCEPTED }];
      bookingRepository.findMany.mockResolvedValue(activeBookings as any);

      // Act
      const result = await service.checkMultipleDriversAvailability(driverIds);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        driverId: 'driver-1',
        isAvailable: true,
        activeBooking: null,
      });
      expect(result[1]).toEqual({
        driverId: 'driver-2',
        isAvailable: false,
        activeBooking: activeBookings[0],
      });
      expect(result[2]).toEqual({
        driverId: 'driver-3',
        isAvailable: true,
        activeBooking: null,
      });
    });

    it('should return empty array for empty input', async () => {
      // Act
      const result = await service.checkMultipleDriversAvailability([]);

      // Assert
      expect(result).toEqual([]);
      expect(bookingRepository.findMany).not.toHaveBeenCalled();
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.checkMultipleDriversAvailability(['driver-1'])).rejects.toThrow('Database error');
    });
  });

  describe('getCustomerBookingHistory', () => {
    it('should get customer booking history successfully', async () => {
      // Arrange
      const daysBack = 30;
      const limit = 50;
      const mockHistory = [{ ...mockBooking, status: BookingStatus.COMPLETED }];
      bookingRepository.findMany.mockResolvedValue(mockHistory as any);

      // Act
      const result = await service.getCustomerBookingHistory('customer-123', daysBack, limit);

      // Assert
      expect(result).toEqual(mockHistory);
      expect(bookingRepository.findMany).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-123',
          status: BookingStatus.COMPLETED,
          driverId: { not: null },
          createdAt: { gte: expect.any(Date) },
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    });

    it('should use default limit', async () => {
      // Arrange
      bookingRepository.findMany.mockResolvedValue([]);

      // Act
      await service.getCustomerBookingHistory('customer-123', 30);

      // Assert
      expect(bookingRepository.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getCustomerBookingHistory('customer-123', 30)).rejects.toThrow('Database error');
    });
  });

  describe('getCustomerCancelledBookings', () => {
    it('should get customer cancelled bookings successfully', async () => {
      // Arrange
      const daysBack = 30;
      const mockCancelledBookings = [{ ...mockBooking, status: BookingStatus.CANCELLED }];
      bookingRepository.findMany.mockResolvedValue(mockCancelledBookings as any);

      // Act
      const result = await service.getCustomerCancelledBookings('customer-123', daysBack);

      // Assert
      expect(result).toEqual(mockCancelledBookings);
      expect(bookingRepository.findMany).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-123',
          status: BookingStatus.CANCELLED,
          driverId: { not: null },
          createdAt: { gte: expect.any(Date) },
        },
        include: {
          driverId: true,
          createdAt: true,
        },
      });
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getCustomerCancelledBookings('customer-123', 30)).rejects.toThrow('Database error');
    });
  });

  describe('getActiveBookingStatistics', () => {
    it('should get active booking statistics successfully', async () => {
      // Arrange
      const mockStats = [
        { status: BookingStatus.PENDING, _count: { status: 5 } },
        { status: BookingStatus.ACCEPTED, _count: { status: 3 } },
        { status: BookingStatus.ONGOING, _count: { status: 2 } },
      ];
      bookingRepository.groupBy.mockResolvedValue(mockStats as any);

      // Act
      const result = await service.getActiveBookingStatistics();

      // Assert
      expect(result).toEqual({
        totalActive: 10,
        byStatus: {
          [BookingStatus.PENDING]: 5,
          [BookingStatus.ACCEPTED]: 3,
          [BookingStatus.ONGOING]: 2,
        },
      });
    });

    it('should handle empty statistics', async () => {
      // Arrange
      bookingRepository.groupBy.mockResolvedValue([]);

      // Act
      const result = await service.getActiveBookingStatistics();

      // Assert
      expect(result).toEqual({
        totalActive: 0,
        byStatus: {},
      });
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.groupBy.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getActiveBookingStatistics()).rejects.toThrow('Database error');
    });
  });

  describe('hasActiveBooking', () => {
    it('should return true if driver has active booking', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue({ id: 'booking-123', status: BookingStatus.ACCEPTED } as any);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(true);
    });

    it('should return true if driver has active trip', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: { id: 'trip-123' } }));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false if driver has no active booking or trip', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of({ success: true, data: null }));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(false);
    });

    it('should return true on tracking service timeout (fail safe)', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(throwError(() => new Error('TimeoutError')));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(false); // Should return false for timeout, not true as fail safe
    });

    it('should return true on error (fail safe)', async () => {
      // Arrange
      bookingRepository.findFirst.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('smartCancelBooking', () => {
    it('should smart cancel booking successfully', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED } as any);
      messagingService.publish.mockResolvedValue(undefined);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.smartCancelBooking('booking-123', 'no_drivers_found');

      // Assert
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.CANCELLED,
        cancelledAt: expect.any(Date),
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: 'customer-123',
        driverId: 'driver-123',
        cancelledBy: 'system',
      });
    });

    it('should return null if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.smartCancelBooking('booking-123', 'no_drivers_found');

      // Assert
      expect(result).toBeNull();
      expect(bookingRepository.update).not.toHaveBeenCalled();
    });

    it('should return null if booking status is not PENDING', async () => {
      // Arrange
      const acceptedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await service.smartCancelBooking('booking-123', 'no_drivers_found');

      // Assert
      expect(result).toBeNull();
      expect(bookingRepository.update).not.toHaveBeenCalled();
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(mockBooking as any);
      bookingRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.smartCancelBooking('booking-123', 'no_drivers_found')).rejects.toThrow('Database error');
    });
  });
});
