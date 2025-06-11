// apps/booking-service/test/unit/booking/booking.service.spec.ts
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
import {
  BookingFactory,
  createGroupByResponse,
  createMockClientProxy,
  createMockHttpService,
  createMockMessagingService,
  createMockRedisClient,
  createTcpResponse,
  mockDriver,
  mockProcessEnv,
} from '../../mocks';

describe('BookingService', () => {
  let service: BookingService;
  let bookingRepository: jest.Mocked<BookingRepository>;
  let httpService: jest.Mocked<HttpService>;
  let trackingServiceClient: jest.Mocked<ClientProxy>;
  let redisClient: any;
  let messagingService: jest.Mocked<MessagingService>;

  const mockCreateBookingDto: CreateBookingDto = {
    pickupLatitude: -6.2088,
    pickupLongitude: 106.8456,
    destinationLatitude: -6.1944,
    destinationLongitude: 106.8229,
  };

  // Set up environment variables
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, ...mockProcessEnv };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        {
          provide: BookingRepository,
          useValue: mockBookingRepository,
        },
        {
          provide: HttpService,
          useValue: createMockHttpService(),
        },
        {
          provide: 'TRACKING_SERVICE',
          useValue: createMockClientProxy(),
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: createMockRedisClient(),
        },
        {
          provide: MessagingService,
          useValue: createMockMessagingService(),
        },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
    bookingRepository = module.get(BookingRepository);
    httpService = module.get(HttpService);
    trackingServiceClient = module.get('TRACKING_SERVICE');
    redisClient = module.get('REDIS_CLIENT');
    messagingService = module.get(MessagingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  describe('createBooking', () => {
    it('should create booking successfully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: 'customer-123' });
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockResolvedValue('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');

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
      expect(messagingService.publish).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException if customer already has active booking', async () => {
      // Arrange
      const activeBooking = BookingFactory.create({ customerId: 'customer-123', status: BookingStatus.ACCEPTED });
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(activeBooking as any);

      // Act & Assert
      await expect(service.createBooking('customer-123', mockCreateBookingDto)).rejects.toThrow(BadRequestException);
      expect(bookingRepository.findActiveBookingByCustomer).toHaveBeenCalledWith('customer-123');
      expect(bookingRepository.create).not.toHaveBeenCalled();
    });

    it('should handle Redis errors with retry mechanism', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: 'customer-123' });
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBooking as any);

      // First hset fails, second succeeds
      redisClient.hset.mockRejectedValueOnce(new Error('Redis connection error')).mockResolvedValueOnce('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');

      // Act
      const result = await service.createBooking('customer-123', mockCreateBookingDto);

      // Assert
      expect(result).toEqual(mockBooking);
      expect(redisClient.hset).toHaveBeenCalledTimes(2); // Retry mechanism
    });

    it('should fail after maximum retries', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: 'customer-123' });
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBooking as any);

      // All retries fail
      redisClient.hset.mockRejectedValue(new Error('Redis connection error'));

      // Act & Assert
      await expect(service.createBooking('customer-123', mockCreateBookingDto)).rejects.toThrow(
        'Redis connection error',
      );
      expect(redisClient.hset).toHaveBeenCalledTimes(3); // Max retries
    });

    it('should handle repository create errors', async () => {
      // Arrange
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockRejectedValue(new Error('Database connection error'));

      // Act & Assert
      await expect(service.createBooking('customer-123', mockCreateBookingDto)).rejects.toThrow(
        'Database connection error',
      );
      expect(messagingService.publish).not.toHaveBeenCalled();
    });

    it('should handle messaging service errors', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: 'customer-123' });
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockResolvedValue('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');
      messagingService.publish.mockRejectedValue(new Error('Messaging service error'));

      // Act & Assert
      await expect(service.createBooking('customer-123', mockCreateBookingDto)).rejects.toThrow(
        'Messaging service error',
      );
    });

    it('should create booking with customer that has no name', async () => {
      // Arrange
      const mockBookingNoCustomer = { ...BookingFactory.create({ customerId: 'customer-123' }), customer: null };
      bookingRepository.findActiveBookingByCustomer.mockResolvedValue(null);
      bookingRepository.create.mockResolvedValue(mockBookingNoCustomer as any);
      redisClient.hset.mockResolvedValue('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');

      // Act
      const result = await service.createBooking('customer-123', mockCreateBookingDto);

      // Assert
      expect(result).toEqual(mockBookingNoCustomer);
      expect(messagingService.publish).toHaveBeenCalledWith(
        BookingEvents.CREATED,
        expect.objectContaining({
          customerName: 'Customer', // Default name
        }),
      );
    });
  });

  describe('getBookingDetails', () => {
    it('should return booking details successfully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations();
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
      expect(bookingRepository.findById).toHaveBeenCalledWith('nonexistent-booking');
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findById.mockRejectedValue(new Error('Database connection error'));

      // Act & Assert
      await expect(service.getBookingDetails('booking-123')).rejects.toThrow('Database connection error');
    });
  });

  describe('getUserBookings', () => {
    it('should return user bookings with pagination', async () => {
      // Arrange
      const mockBookings = [BookingFactory.createWithRelations({ customerId: 'user-123' })];
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
      const mockBookings = [BookingFactory.createWithRelations({ customerId: 'user-123' })];
      bookingRepository.findByUser.mockResolvedValue(mockBookings as any);
      bookingRepository.countByUser.mockResolvedValue(1);

      // Act
      const result = await service.getUserBookings('user-123');

      // Assert
      expect(bookingRepository.findByUser).toHaveBeenCalledWith('user-123', undefined, 0, 10);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should handle repository errors', async () => {
      // Arrange
      bookingRepository.findByUser.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.getUserBookings('user-123')).rejects.toThrow('Database error');
    });

    it('should calculate pages correctly for empty results', async () => {
      // Arrange
      bookingRepository.findByUser.mockResolvedValue([]);
      bookingRepository.countByUser.mockResolvedValue(0);

      // Act
      const result = await service.getUserBookings('user-123');

      // Assert
      expect(result.meta.pages).toBe(0);
      expect(result.meta.total).toBe(0);
    });

    it('should calculate pages correctly for multiple pages', async () => {
      // Arrange
      const mockBookings = [BookingFactory.createWithRelations()];
      bookingRepository.findByUser.mockResolvedValue(mockBookings as any);
      bookingRepository.countByUser.mockResolvedValue(25);

      // Act
      const result = await service.getUserBookings('user-123', undefined, 1, 10);

      // Assert
      expect(result.meta.pages).toBe(3); // ceil(25/10) = 3
    });
  });

  describe('updateBookingStatus', () => {
    it('should update booking status successfully', async () => {
      // Arrange
      const originalBooking = BookingFactory.create({ customerId: 'customer-123', status: BookingStatus.PENDING });
      const updatedBooking = { ...originalBooking, status: BookingStatus.ACCEPTED, acceptedAt: expect.any(Date) };
      bookingRepository.findById.mockResolvedValue(originalBooking as any);
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

    it('should update booking status with custom timestamp', async () => {
      // Arrange
      const customTimestamp = new Date('2024-01-01T10:00:00.000Z');
      const originalBooking = BookingFactory.create({ customerId: 'customer-123', status: BookingStatus.ACCEPTED });
      const updatedBooking = { ...originalBooking, status: BookingStatus.ONGOING, startedAt: customTimestamp };
      bookingRepository.findById.mockResolvedValue(originalBooking as any);
      bookingRepository.update.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await service.updateBookingStatus(
        'booking-123',
        'customer-123',
        BookingStatus.ONGOING,
        customTimestamp,
      );

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.ONGOING,
        startedAt: customTimestamp,
      });
    });

    it('should handle all status transitions with correct timestamp fields', async () => {
      // Arrange
      const originalBooking = BookingFactory.create({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(originalBooking as any);

      const testCases = [
        { status: BookingStatus.ACCEPTED, expectedField: 'acceptedAt' },
        { status: BookingStatus.REJECTED, expectedField: 'rejectedAt' },
        { status: BookingStatus.CANCELLED, expectedField: 'cancelledAt' },
        { status: BookingStatus.ONGOING, expectedField: 'startedAt' },
        { status: BookingStatus.COMPLETED, expectedField: 'completedAt' },
      ];

      for (const testCase of testCases) {
        const updatedBooking = { ...originalBooking, status: testCase.status };
        bookingRepository.update.mockResolvedValue(updatedBooking as any);

        // Act
        await service.updateBookingStatus('booking-123', 'customer-123', testCase.status);

        // Assert
        expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
          status: testCase.status,
          [testCase.expectedField]: expect.any(Date),
        });
      }
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
      const booking = BookingFactory.create({ customerId: 'customer-123', driverId: 'driver-123' });
      bookingRepository.findById.mockResolvedValue(booking as any);

      // Act & Assert
      await expect(
        service.updateBookingStatus('booking-123', 'unauthorized-user', BookingStatus.ACCEPTED),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should validate status transitions for customer', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({
        customerId: 'customer-123',
        status: BookingStatus.PENDING,
      });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);

      // Act & Assert - Customer can only cancel pending booking
      await expect(service.updateBookingStatus('booking-123', 'customer-123', BookingStatus.ACCEPTED)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate status transitions for driver', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({
        customerId: 'customer-123',
        driverId: 'driver-123',
        status: BookingStatus.PENDING,
      });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);

      // Act & Assert - Driver cannot set to ONGOING from PENDING
      await expect(service.updateBookingStatus('booking-123', 'driver-123', BookingStatus.ONGOING)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prevent status changes on completed booking', async () => {
      // Arrange
      const completedBooking = BookingFactory.createCompleted({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(completedBooking as any);

      // Act & Assert
      await expect(service.updateBookingStatus('booking-123', 'customer-123', BookingStatus.PENDING)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prevent status changes on cancelled booking', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(cancelledBooking as any);

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
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING, driverId: null });
      const acceptedBooking = BookingFactory.createAccepted({
        id: 'booking-123',
        driverId: 'driver-123',
        driver: mockDriver,
      });

      redisClient.set.mockResolvedValue('OK'); // Lock acquired
      redisClient.sismember.mockResolvedValue(1); // Driver is eligible
      redisClient.del.mockResolvedValue(1);

      bookingRepository.findFirst.mockResolvedValue(null); // No active booking
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null))); // No active trip
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.updateWithCondition.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await service.acceptBooking('booking-123', 'driver-123');

      // Assert
      expect(result).toEqual(acceptedBooking);
      expect(redisClient.set).toHaveBeenCalledWith(lockKey, 'driver-123', 'PX', 10000, 'NX');
      expect(bookingRepository.updateWithCondition).toHaveBeenCalledWith(
        'booking-123',
        {
          status: BookingStatus.ACCEPTED,
          driverId: 'driver-123',
          acceptedAt: expect.any(Date),
        },
        {
          status: BookingStatus.PENDING,
          driverId: null,
        },
      );
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.ACCEPTED, expect.any(Object));
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.TAKEN, expect.any(Object));
      expect(redisClient.del).toHaveBeenCalledWith(lockKey); // Lock released
    });

    it('should throw BadRequestException if lock cannot be acquired', async () => {
      // Arrange
      redisClient.set.mockResolvedValue(null); // Lock not acquired
      redisClient.del.mockResolvedValue(1);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'Booking is currently being processed by another driver. Please try again.',
      );
    });

    it('should throw BadRequestException if driver has active booking', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const activeBooking = BookingFactory.create({ driverId: 'driver-123', status: BookingStatus.ACCEPTED });
      bookingRepository.findFirst.mockResolvedValue(activeBooking as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'You already have an active booking or trip. Complete it first.',
      );
    });

    it('should throw BadRequestException if driver has active trip', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      bookingRepository.findFirst.mockResolvedValue(null); // No active booking
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, { id: 'trip-123' }))); // Has active trip

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'You already have an active booking or trip. Complete it first.',
      );
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not PENDING', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const acceptedBooking = BookingFactory.createAccepted();
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'Booking is no longer available',
      );
    });

    it('should throw BadRequestException if booking already has driver', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const bookingWithDriver = BookingFactory.create({
        status: BookingStatus.PENDING,
        driverId: 'other-driver',
      });
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));
      bookingRepository.findById.mockResolvedValue(bookingWithDriver as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'Booking has already been accepted by another driver',
      );
    });

    it('should throw UnauthorizedException if driver not eligible', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      redisClient.sismember.mockResolvedValue(0); // Driver not eligible
      redisClient.smembers.mockResolvedValue(['other-driver-1', 'other-driver-2']);

      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING, driverId: null });
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'You are not eligible to accept this booking. Only nearby drivers can accept.',
      );
    });

    it('should throw BadRequestException if updateWithCondition returns null', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      redisClient.sismember.mockResolvedValue(1);

      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING, driverId: null });
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.updateWithCondition.mockResolvedValue(null); // Race condition - booking taken

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow(
        'Booking is no longer available or has been taken by another driver',
      );
    });

    it('should cleanup Redis data on successful acceptance', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING, driverId: null });
      const acceptedBooking = BookingFactory.createAccepted({ driverId: 'driver-123' });

      redisClient.set.mockResolvedValue('OK');
      redisClient.sismember.mockResolvedValue(1);
      redisClient.del.mockResolvedValue(1);

      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.updateWithCondition.mockResolvedValue(acceptedBooking as any);

      // Act
      await service.acceptBooking('booking-123', 'driver-123');

      // Assert
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123:eligible-drivers');
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123:rejected-drivers');
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123');
    });

    it('should always release lock even if error occurs', async () => {
      // Arrange
      const lockKey = 'lock:booking:booking-123:accept';
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      bookingRepository.findFirst.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.acceptBooking('booking-123', 'driver-123')).rejects.toThrow('Database error');
      expect(redisClient.del).toHaveBeenCalledWith(lockKey); // Lock released despite error
    });

    it('should handle tracking service timeout gracefully', async () => {
      // Arrange
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const timeoutError = new Error('TimeoutError');
      timeoutError.name = 'TimeoutError';

      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(throwError(() => timeoutError));

      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING, driverId: null });
      const acceptedBooking = BookingFactory.createAccepted({ driverId: 'driver-123' });

      redisClient.sismember.mockResolvedValue(1);
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.updateWithCondition.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await service.acceptBooking('booking-123', 'driver-123');

      // Assert
      expect(result).toEqual(acceptedBooking);
      // Should still proceed with booking acceptance despite tracking service timeout
    });
  });

  describe('rejectBooking', () => {
    it('should reject booking successfully', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(pendingBooking as any);
      redisClient.sadd.mockResolvedValue(1);

      // Mock auto-cancel disabled
      process.env.BOOKING_AUTO_CANCEL_ENABLED = 'false';

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
      const acceptedBooking = BookingFactory.createAccepted();
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act & Assert
      await expect(service.rejectBooking('booking-123', 'driver-123')).rejects.toThrow(
        'Cannot reject booking with status accepted',
      );
    });

    it('should trigger smart cancel when all drivers rejected', async () => {
      // Arrange
      process.env.BOOKING_AUTO_CANCEL_ENABLED = 'true';

      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(pendingBooking as any);
      redisClient.sadd.mockResolvedValue(1);

      // Mock all drivers rejected scenario
      redisClient.smembers
        .mockResolvedValueOnce(['driver-1', 'driver-2', 'driver-123']) // eligible drivers
        .mockResolvedValueOnce(['driver-1', 'driver-2', 'driver-123']); // rejected drivers

      // Mock smartCancelBooking
      const smartCancelSpy = jest.spyOn(service, 'smartCancelBooking').mockResolvedValue(undefined);

      // Act
      const result = await service.rejectBooking('booking-123', 'driver-123');

      // Assert
      expect(result).toEqual({ message: 'Booking rejected successfully' });

      // Wait for the setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 11000));

      expect(smartCancelSpy).toHaveBeenCalledWith('booking-123', 'all_drivers_rejected');
    });

    it('should not trigger smart cancel when not all drivers rejected', async () => {
      // Arrange
      process.env.BOOKING_AUTO_CANCEL_ENABLED = 'true';

      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(pendingBooking as any);
      redisClient.sadd.mockResolvedValue(1);

      // Mock not all drivers rejected scenario
      redisClient.smembers
        .mockResolvedValueOnce(['driver-1', 'driver-2', 'driver-123']) // eligible drivers
        .mockResolvedValueOnce(['driver-1', 'driver-123']); // only 2 rejected out of 3

      // Mock smartCancelBooking
      const smartCancelSpy = jest.spyOn(service, 'smartCancelBooking').mockResolvedValue(undefined);

      // Act
      await service.rejectBooking('booking-123', 'driver-123');

      // Assert
      expect(smartCancelSpy).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(pendingBooking as any);
      redisClient.sadd.mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(service.rejectBooking('booking-123', 'driver-123')).rejects.toThrow('Redis error');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking successfully by customer', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({ customerId: 'customer-123' });
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123' });

      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.cancelBooking('booking-123', 'customer-123');

      // Assert
      expect(result).toEqual(cancelledBooking);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.CANCELLED,
        cancelledAt: expect.any(Date),
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: 'customer-123',
        driverId: acceptedBooking.driverId,
        cancelledBy: 'customer',
      });
    });

    it('should cancel booking successfully by driver', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({
        customerId: 'customer-123',
        driverId: 'driver-123',
      });
      const cancelledBooking = BookingFactory.createCancelled({
        customerId: 'customer-123',
        driverId: 'driver-123',
      });

      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.cancelBooking('booking-123', 'driver-123');

      // Assert
      expect(result).toEqual(cancelledBooking);
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: 'customer-123',
        driverId: 'driver-123',
        cancelledBy: 'driver',
      });
    });

    it('should handle booking with no driver ID', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ customerId: 'customer-123', driverId: null });
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123', driverId: null });

      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.cancelBooking('booking-123', 'customer-123');

      // Assert
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: 'customer-123',
        driverId: undefined, // null becomes undefined
        cancelledBy: 'customer',
      });
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.cancelBooking('booking-123', 'customer-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not cancellable', async () => {
      // Arrange
      const completedBooking = BookingFactory.createCompleted({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(completedBooking as any);

      // Act & Assert
      await expect(service.cancelBooking('booking-123', 'customer-123')).rejects.toThrow(
        'Cannot cancel booking with status completed',
      );
    });

    it('should throw UnauthorizedException if user not authorized', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({
        customerId: 'customer-123',
        driverId: 'driver-123',
      });
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act & Assert
      await expect(service.cancelBooking('booking-123', 'unauthorized-user')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle Redis cleanup errors gracefully', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({ customerId: 'customer-123' });
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123' });

      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await service.cancelBooking('booking-123', 'customer-123');

      // Assert
      expect(result).toEqual(cancelledBooking); // Should still return successfully
    });
  });

  describe('deleteBooking', () => {
    it('should delete cancelled booking successfully', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(cancelledBooking as any);
      bookingRepository.delete.mockResolvedValue(undefined);

      // Act
      const result = await service.deleteBooking('booking-123', 'customer-123');

      // Assert
      expect(result).toEqual({ message: 'Booking deleted successfully' });
      expect(bookingRepository.delete).toHaveBeenCalledWith('booking-123');
    });

    it('should delete completed booking successfully', async () => {
      // Arrange
      const completedBooking = BookingFactory.createCompleted({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(completedBooking as any);
      bookingRepository.delete.mockResolvedValue(undefined);

      // Act
      const result = await service.deleteBooking('booking-123', 'customer-123');

      // Assert
      expect(result).toEqual({ message: 'Booking deleted successfully' });
    });

    it('should throw NotFoundException if booking not found', async () => {
      // Arrange
      bookingRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'customer-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking status is not deletable', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ customerId: 'customer-123', status: BookingStatus.PENDING });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'customer-123')).rejects.toThrow(
        'Cannot delete booking with status pending',
      );
    });

    it('should throw UnauthorizedException if user is not customer', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(cancelledBooking as any);

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'driver-123')).rejects.toThrow(
        'Only the customer can delete a booking',
      );
    });

    it('should handle repository delete errors', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: 'customer-123' });
      bookingRepository.findById.mockResolvedValue(cancelledBooking as any);
      bookingRepository.delete.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.deleteBooking('booking-123', 'customer-123')).rejects.toThrow('Database error');
    });
  });

  describe('completeBookingFromTrip', () => {
    it('should complete booking from trip service successfully', async () => {
      // Arrange
      const completedAt = new Date('2024-01-01T03:00:00.000Z');
      const completedBooking = BookingFactory.createCompleted({ completedAt });
      bookingRepository.update.mockResolvedValue(completedBooking as any);

      // Act
      const result = await service.completeBookingFromTrip('booking-123', completedAt);

      // Assert
      expect(result).toEqual(completedBooking);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.COMPLETED,
        completedAt: completedAt,
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.COMPLETED, {
        bookingId: 'booking-123',
        customerId: completedBooking.customerId,
        tripDetails: {
          completedAt: completedAt,
          status: 'COMPLETED',
        },
      });
    });

    it('should handle repository update errors', async () => {
      // Arrange
      const completedAt = new Date();
      bookingRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.completeBookingFromTrip('booking-123', completedAt)).rejects.toThrow('Database error');
    });

    it('should handle messaging errors', async () => {
      // Arrange
      const completedAt = new Date();
      const completedBooking = BookingFactory.createCompleted({ completedAt });
      bookingRepository.update.mockResolvedValue(completedBooking as any);
      messagingService.publish.mockRejectedValue(new Error('Messaging error'));

      // Act & Assert
      await expect(service.completeBookingFromTrip('booking-123', completedAt)).rejects.toThrow('Messaging error');
    });
  });

  describe('checkMultipleDriversAvailability', () => {
    it('should check multiple drivers availability successfully', async () => {
      // Arrange
      const driverIds = ['driver-1', 'driver-2', 'driver-3'];
      const activeBookings = [{ driverId: 'driver-2', status: BookingStatus.ACCEPTED, id: 'booking-active' }];
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

    it('should handle drivers with null driverId in active bookings', async () => {
      // Arrange
      const driverIds = ['driver-1', 'driver-2'];
      const activeBookings = [
        { driverId: null, status: BookingStatus.PENDING, id: 'booking-pending' }, // Should be filtered out
      ];
      bookingRepository.findMany.mockResolvedValue(activeBookings as any);

      // Act
      const result = await service.checkMultipleDriversAvailability(driverIds);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].isAvailable).toBe(true);
      expect(result[1].isAvailable).toBe(true);
    });
  });

  describe('getCustomerBookingHistory', () => {
    it('should get customer booking history successfully', async () => {
      // Arrange
      const daysBack = 30;
      const limit = 50;
      const mockHistory = [BookingFactory.createCompleted({ customerId: 'customer-123' })];
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
    });

    it('should use default limit when not provided', async () => {
      // Arrange
      bookingRepository.findMany.mockResolvedValue([]);

      // Act
      await service.getCustomerBookingHistory('customer-123', 30);

      // Assert
      expect(bookingRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50, // default limit
        }),
      );
    });

    it('should calculate correct date range', async () => {
      // Arrange
      const daysBack = 7;
      const now = new Date('2024-01-08T00:00:00.000Z');
      const spy = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

      bookingRepository.findMany.mockResolvedValue([]);

      // Act
      await service.getCustomerBookingHistory('customer-123', daysBack);

      // Assert
      const expectedCutoffDate = new Date('2024-01-01T00:00:00.000Z');
      expect(bookingRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: expectedCutoffDate },
          }),
        }),
      );

      spy.mockRestore();
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
      const mockCancelledBookings = [BookingFactory.createCancelled({ customerId: 'customer-123' })];
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
        createGroupByResponse(BookingStatus.PENDING, 5),
        createGroupByResponse(BookingStatus.ACCEPTED, 3),
        createGroupByResponse(BookingStatus.ONGOING, 2),
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

    it('should handle malformed statistics data', async () => {
      // Arrange
      const malformedStats = [
        { status: BookingStatus.PENDING, _count: 5 }, // Wrong structure
        { status: BookingStatus.ACCEPTED, _count: { status: 3 } }, // Correct structure
      ];
      bookingRepository.groupBy.mockResolvedValue(malformedStats as any);

      // Act
      const result = await service.getActiveBookingStatistics();

      // Assert
      expect(result).toEqual({
        totalActive: 3, // Only the correctly structured one counted
        byStatus: {
          [BookingStatus.ACCEPTED]: 3,
        },
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
      const activeBooking = { id: 'booking-123', status: BookingStatus.ACCEPTED };
      bookingRepository.findFirst.mockResolvedValue(activeBooking as any);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(true);
      expect(bookingRepository.findFirst).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-123',
          status: {
            in: [BookingStatus.ACCEPTED, BookingStatus.ONGOING],
          },
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    it('should return true if driver has active trip', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, { id: 'trip-123' })));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false if driver has no active booking or trip', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(true, null)));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false on tracking service timeout', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      const timeoutError = new Error('TimeoutError');
      timeoutError.name = 'TimeoutError';
      trackingServiceClient.send.mockReturnValue(throwError(() => timeoutError));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(false); // Graceful handling of timeout
    });

    it('should return false on tracking service general error', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(throwError(() => new Error('Connection error')));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(false); // Graceful handling of general errors
    });

    it('should return true on booking repository error (fail safe)', async () => {
      // Arrange
      bookingRepository.findFirst.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(true); // Fail safe approach
    });

    it('should handle tracking service returning failed response', async () => {
      // Arrange
      bookingRepository.findFirst.mockResolvedValue(null);
      trackingServiceClient.send.mockReturnValue(of(createTcpResponse(false, null, 'Service error')));

      // Act
      const result = await service.hasActiveBooking('driver-123');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('smartCancelBooking', () => {
    it('should smart cancel booking successfully', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      const cancelledBooking = BookingFactory.createCancelled();

      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

      // Act
      const result = await service.smartCancelBooking('booking-123', 'no_drivers_found');

      // Assert
      expect(result).toEqual(cancelledBooking);
      expect(bookingRepository.update).toHaveBeenCalledWith('booking-123', {
        status: BookingStatus.CANCELLED,
        cancelledAt: expect.any(Date),
      });
      expect(messagingService.publish).toHaveBeenCalledWith(BookingEvents.CANCELLED, {
        bookingId: 'booking-123',
        customerId: pendingBooking.customerId,
        driverId: pendingBooking.driverId,
        cancelledBy: 'system',
      });
    });

    it('should test all smart cancel reasons', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      const cancelledBooking = BookingFactory.createCancelled();

      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);

      const reasons: Array<'no_drivers_found' | 'all_drivers_rejected' | 'timeout' | 'system'> = [
        'no_drivers_found',
        'all_drivers_rejected',
        'timeout',
        'system',
      ];

      for (const reason of reasons) {
        // Act
        const result = await service.smartCancelBooking('booking-123', reason);

        // Assert
        expect(result).toEqual(cancelledBooking);
      }
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
      const acceptedBooking = BookingFactory.createAccepted();
      bookingRepository.findById.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await service.smartCancelBooking('booking-123', 'no_drivers_found');

      // Assert
      expect(result).toBeNull();
      expect(bookingRepository.update).not.toHaveBeenCalled();
    });

    it('should cleanup all Redis keys', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      const cancelledBooking = BookingFactory.createCancelled();

      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

      // Act
      await service.smartCancelBooking('booking-123', 'timeout');

      // Assert
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123:eligible-drivers');
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123:rejected-drivers');
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123');
      expect(redisClient.del).toHaveBeenCalledWith('booking:booking-123:timeout');
    });

    it('should handle repository errors', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      bookingRepository.findById.mockResolvedValue(pendingBooking as any);
      bookingRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.smartCancelBooking('booking-123', 'system')).rejects.toThrow('Database error');
    });
  });
});
