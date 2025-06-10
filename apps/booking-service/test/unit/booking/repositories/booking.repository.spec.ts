// apps/booking-service/test/unit/booking/repositories/booking.repository.spec.ts
import { BookingRepository } from '@app/booking/repositories/booking.repository';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { PrismaService } from '@app/database';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingFactory,
  createMockDriverProfile,
  createMockPrismaBooking,
  mockCustomer,
  mockDriver,
} from '../../../mocks';

describe('BookingRepository', () => {
  let repository: BookingRepository;
  let prismaService: jest.Mocked<PrismaService>;

  const mockBookingWithRelations = {
    ...BookingFactory.create(),
    customer: mockCustomer,
    driver: {
      ...mockDriver,
      driverProfile: createMockDriverProfile(),
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      booking: createMockPrismaBooking(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<BookingRepository>(BookingRepository);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create booking successfully', async () => {
      // Arrange
      const createData = {
        customerId: 'customer-123',
        pickupLat: -6.2088,
        pickupLng: 106.8456,
        destinationLat: -6.1944,
        destinationLng: 106.8229,
        status: BookingStatus.PENDING,
      };
      prismaService.booking.create.mockResolvedValue(mockBookingWithRelations as any);

      // Act
      const result = await repository.create(createData);

      // Assert
      expect(result).toEqual(mockBookingWithRelations);
      expect(prismaService.booking.create).toHaveBeenCalledWith({
        data: createData,
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should create booking with minimal data', async () => {
      // Arrange
      const minimalData = {
        customerId: 'customer-123',
        pickupLat: -6.2088,
        pickupLng: 106.8456,
        destinationLat: -6.1944,
        destinationLng: 106.8229,
      };
      const createdBooking = BookingFactory.createWithRelations(minimalData);
      prismaService.booking.create.mockResolvedValue(createdBooking as any);

      // Act
      const result = await repository.create(minimalData);

      // Assert
      expect(result).toEqual(createdBooking);
      expect(prismaService.booking.create).toHaveBeenCalledWith({
        data: minimalData,
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should handle database connection errors', async () => {
      // Arrange
      const createData = {
        customerId: 'customer-123',
        pickupLat: -6.2088,
        pickupLng: 106.8456,
        destinationLat: -6.1944,
        destinationLng: 106.8229,
        status: BookingStatus.PENDING,
      };
      const error = new Error('Database connection failed');
      prismaService.booking.create.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.create(createData)).rejects.toThrow('Database connection failed');
      expect(prismaService.booking.create).toHaveBeenCalledWith({
        data: createData,
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should handle unique constraint violations', async () => {
      // Arrange
      const createData = {
        customerId: 'customer-123',
        pickupLat: -6.2088,
        pickupLng: 106.8456,
        destinationLat: -6.1944,
        destinationLng: 106.8229,
        status: BookingStatus.PENDING,
      };
      const uniqueError = new Error('Unique constraint failed');
      uniqueError.name = 'PrismaClientKnownRequestError';
      prismaService.booking.create.mockRejectedValue(uniqueError);

      // Act & Assert
      await expect(repository.create(createData)).rejects.toThrow('Unique constraint failed');
    });

    it('should handle validation errors', async () => {
      // Arrange
      const invalidData = {
        customerId: '', // Invalid empty customer ID
        pickupLat: 91, // Invalid latitude
        pickupLng: 181, // Invalid longitude
        destinationLat: -91, // Invalid latitude
        destinationLng: -181, // Invalid longitude
      };
      const validationError = new Error('Validation failed');
      prismaService.booking.create.mockRejectedValue(validationError);

      // Act & Assert
      await expect(repository.create(invalidData)).rejects.toThrow('Validation failed');
    });
  });

  describe('findById', () => {
    it('should find booking by id successfully', async () => {
      // Arrange
      prismaService.booking.findUnique.mockResolvedValue(mockBookingWithRelations as any);

      // Act
      const result = await repository.findById('booking-123');

      // Assert
      expect(result).toEqual(mockBookingWithRelations);
      expect(prismaService.booking.findUnique).toHaveBeenCalledWith({
        where: { id: 'booking-123' },
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should return null when booking not found', async () => {
      // Arrange
      prismaService.booking.findUnique.mockResolvedValue(null);

      // Act
      const result = await repository.findById('nonexistent-booking');

      // Assert
      expect(result).toBeNull();
      expect(prismaService.booking.findUnique).toHaveBeenCalledWith({
        where: { id: 'nonexistent-booking' },
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = new Error('Database connection error');
      prismaService.booking.findUnique.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findById('booking-123')).rejects.toThrow('Database connection error');
    });

    it('should handle malformed booking ID', async () => {
      // Arrange
      const error = new Error('Invalid UUID format');
      prismaService.booking.findUnique.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findById('invalid-uuid')).rejects.toThrow('Invalid UUID format');
    });

    it('should find booking with no relations', async () => {
      // Arrange
      const bookingWithoutRelations = {
        ...BookingFactory.create(),
        customer: null,
        driver: null,
      };
      prismaService.booking.findUnique.mockResolvedValue(bookingWithoutRelations as any);

      // Act
      const result = await repository.findById('booking-123');

      // Assert
      expect(result).toEqual(bookingWithoutRelations);
      expect(result.customer).toBeNull();
      expect(result.driver).toBeNull();
    });
  });

  describe('update', () => {
    it('should update booking successfully', async () => {
      // Arrange
      const updateData = {
        status: BookingStatus.ACCEPTED,
        acceptedAt: new Date('2024-01-01T01:00:00.000Z'),
        driverId: 'driver-123',
      };
      const updatedBooking = {
        ...mockBookingWithRelations,
        ...updateData,
      };
      prismaService.booking.update.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await repository.update('booking-123', updateData);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(prismaService.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-123' },
        data: updateData,
        include: {
          customer: true,
          driver: {
            include: {
              driverProfile: true,
            },
          },
        },
      });
    });

    it('should update booking with partial data', async () => {
      // Arrange
      const updateData = { status: BookingStatus.CANCELLED };
      const updatedBooking = {
        ...mockBookingWithRelations,
        status: BookingStatus.CANCELLED,
      };
      prismaService.booking.update.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await repository.update('booking-123', updateData);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(prismaService.booking.update).toHaveBeenCalledWith({
        where: { id: 'booking-123' },
        data: updateData,
        include: {
          customer: true,
          driver: {
            include: {
              driverProfile: true,
            },
          },
        },
      });
    });

    it('should handle record not found errors', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const error = new Error('Record to update not found');
      prismaService.booking.update.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.update('nonexistent-booking', updateData)).rejects.toThrow('Record to update not found');
    });

    it('should handle optimistic concurrency errors', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const concurrencyError = new Error('Record was modified by another process');
      concurrencyError.name = 'PrismaClientKnownRequestError';
      prismaService.booking.update.mockRejectedValue(concurrencyError);

      // Act & Assert
      await expect(repository.update('booking-123', updateData)).rejects.toThrow(
        'Record was modified by another process',
      );
    });

    it('should handle validation errors on update', async () => {
      // Arrange
      const invalidUpdateData = {
        status: 'INVALID_STATUS' as BookingStatus,
      };
      const validationError = new Error('Invalid enum value');
      prismaService.booking.update.mockRejectedValue(validationError);

      // Act & Assert
      await expect(repository.update('booking-123', invalidUpdateData)).rejects.toThrow('Invalid enum value');
    });
  });

  describe('delete', () => {
    it('should delete booking successfully', async () => {
      // Arrange
      const deletedBooking = BookingFactory.create();
      prismaService.booking.delete.mockResolvedValue(deletedBooking as any);

      // Act
      await repository.delete('booking-123');

      // Assert
      expect(prismaService.booking.delete).toHaveBeenCalledWith({
        where: { id: 'booking-123' },
      });
    });

    it('should handle record not found errors', async () => {
      // Arrange
      const error = new Error('Record to delete does not exist');
      prismaService.booking.delete.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.delete('nonexistent-booking')).rejects.toThrow('Record to delete does not exist');
    });

    it('should handle foreign key constraint violations', async () => {
      // Arrange
      const foreignKeyError = new Error('Foreign key constraint failed on the field');
      foreignKeyError.name = 'PrismaClientKnownRequestError';
      prismaService.booking.delete.mockRejectedValue(foreignKeyError);

      // Act & Assert
      await expect(repository.delete('booking-123')).rejects.toThrow('Foreign key constraint failed on the field');
    });

    it('should handle database connection errors', async () => {
      // Arrange
      const connectionError = new Error('Database connection failed');
      prismaService.booking.delete.mockRejectedValue(connectionError);

      // Act & Assert
      await expect(repository.delete('booking-123')).rejects.toThrow('Database connection failed');
    });
  });

  describe('findByUser', () => {
    it('should find bookings by user with default parameters', async () => {
      // Arrange
      const mockBookings = [mockBookingWithRelations];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findByUser('user-123');

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
        },
        include: {
          customer: true,
          driver: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 10,
      });
    });

    it('should find bookings by user with status filter', async () => {
      // Arrange
      const mockBookings = [
        BookingFactory.createWithRelations({
          customerId: 'user-123',
          status: BookingStatus.PENDING,
        }),
      ];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findByUser('user-123', BookingStatus.PENDING);

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
          status: BookingStatus.PENDING,
        },
        include: {
          customer: true,
          driver: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 10,
      });
    });

    it('should find bookings by user with pagination', async () => {
      // Arrange
      const mockBookings = [mockBookingWithRelations];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findByUser('user-123', undefined, 20, 5);

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
        },
        include: {
          customer: true,
          driver: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 20,
        take: 5,
      });
    });

    it('should find bookings with combined status and pagination', async () => {
      // Arrange
      const mockBookings = [
        BookingFactory.createWithRelations({
          driverId: 'user-123',
          status: BookingStatus.COMPLETED,
        }),
      ];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findByUser('user-123', BookingStatus.COMPLETED, 10, 15);

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
          status: BookingStatus.COMPLETED,
        },
        include: {
          customer: true,
          driver: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 10,
        take: 15,
      });
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = new Error('Database query failed');
      prismaService.booking.findMany.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findByUser('user-123')).rejects.toThrow('Database query failed');
    });

    it('should return empty array when no bookings found', async () => {
      // Arrange
      prismaService.booking.findMany.mockResolvedValue([]);

      // Act
      const result = await repository.findByUser('user-with-no-bookings');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('countByUser', () => {
    it('should count bookings by user without status filter', async () => {
      // Arrange
      prismaService.booking.count.mockResolvedValue(5);

      // Act
      const result = await repository.countByUser('user-123');

      // Assert
      expect(result).toBe(5);
      expect(prismaService.booking.count).toHaveBeenCalledWith({
        where: {
          OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
        },
      });
    });

    it('should count bookings by user with status filter', async () => {
      // Arrange
      prismaService.booking.count.mockResolvedValue(3);

      // Act
      const result = await repository.countByUser('user-123', BookingStatus.COMPLETED);

      // Assert
      expect(result).toBe(3);
      expect(prismaService.booking.count).toHaveBeenCalledWith({
        where: {
          OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
          status: BookingStatus.COMPLETED,
        },
      });
    });

    it('should return zero for user with no bookings', async () => {
      // Arrange
      prismaService.booking.count.mockResolvedValue(0);

      // Act
      const result = await repository.countByUser('user-with-no-bookings');

      // Assert
      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = new Error('Database count failed');
      prismaService.booking.count.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.countByUser('user-123')).rejects.toThrow('Database count failed');
    });

    it('should handle all booking statuses', async () => {
      // Arrange
      const statuses = [
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.REJECTED,
        BookingStatus.ONGOING,
        BookingStatus.CANCELLED,
        BookingStatus.COMPLETED,
      ];

      for (const status of statuses) {
        prismaService.booking.count.mockResolvedValue(2);

        // Act
        const result = await repository.countByUser('user-123', status);

        // Assert
        expect(result).toBe(2);
        expect(prismaService.booking.count).toHaveBeenCalledWith({
          where: {
            OR: [{ customerId: 'user-123' }, { driverId: 'user-123' }],
            status,
          },
        });
      }
    });
  });

  describe('findActiveBookingByCustomer', () => {
    it('should find active booking by customer successfully', async () => {
      // Arrange
      const activeBooking = BookingFactory.createWithRelations({
        customerId: 'customer-123',
        status: BookingStatus.ACCEPTED,
      });
      prismaService.booking.findFirst.mockResolvedValue(activeBooking as any);

      // Act
      const result = await repository.findActiveBookingByCustomer('customer-123');

      // Assert
      expect(result).toEqual(activeBooking);
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-123',
          status: {
            in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.ONGOING],
          },
        },
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should return null when no active booking found', async () => {
      // Arrange
      prismaService.booking.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findActiveBookingByCustomer('customer-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = new Error('Database query failed');
      prismaService.booking.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findActiveBookingByCustomer('customer-123')).rejects.toThrow('Database query failed');
    });

    it('should find pending booking', async () => {
      // Arrange
      const pendingBooking = BookingFactory.createWithRelations({
        customerId: 'customer-123',
        status: BookingStatus.PENDING,
      });
      prismaService.booking.findFirst.mockResolvedValue(pendingBooking as any);

      // Act
      const result = await repository.findActiveBookingByCustomer('customer-123');

      // Assert
      expect(result).toEqual(pendingBooking);
    });

    it('should find ongoing booking', async () => {
      // Arrange
      const ongoingBooking = BookingFactory.createOngoing({
        customerId: 'customer-123',
      });
      prismaService.booking.findFirst.mockResolvedValue(ongoingBooking as any);

      // Act
      const result = await repository.findActiveBookingByCustomer('customer-123');

      // Assert
      expect(result).toEqual(ongoingBooking);
    });

    it('should not find completed booking as active', async () => {
      // Arrange
      prismaService.booking.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findActiveBookingByCustomer('customer-123');

      // Assert
      expect(result).toBeNull();
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-123',
          status: {
            in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.ONGOING],
          },
        },
        include: {
          customer: true,
          driver: true,
        },
      });
    });
  });

  describe('findActiveBookingByDriver', () => {
    it('should find active booking by driver successfully', async () => {
      // Arrange
      const activeBooking = BookingFactory.createOngoing({
        driverId: 'driver-123',
      });
      prismaService.booking.findFirst.mockResolvedValue(activeBooking as any);

      // Act
      const result = await repository.findActiveBookingByDriver('driver-123');

      // Assert
      expect(result).toEqual(activeBooking);
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-123',
          status: {
            in: [BookingStatus.ACCEPTED, BookingStatus.ONGOING],
          },
        },
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should return null when no active booking found', async () => {
      // Arrange
      prismaService.booking.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findActiveBookingByDriver('driver-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = new Error('Database query failed');
      prismaService.booking.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findActiveBookingByDriver('driver-123')).rejects.toThrow('Database query failed');
    });

    it('should find accepted booking', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({
        driverId: 'driver-123',
      });
      prismaService.booking.findFirst.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await repository.findActiveBookingByDriver('driver-123');

      // Assert
      expect(result).toEqual(acceptedBooking);
    });

    it('should not find pending booking as active for driver', async () => {
      // Arrange
      prismaService.booking.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findActiveBookingByDriver('driver-123');

      // Assert
      expect(result).toBeNull();
      // Driver should only see ACCEPTED and ONGOING, not PENDING
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-123',
          status: {
            in: [BookingStatus.ACCEPTED, BookingStatus.ONGOING],
          },
        },
        include: {
          customer: true,
          driver: true,
        },
      });
    });
  });

  describe('findMany', () => {
    it('should find many bookings with parameters', async () => {
      // Arrange
      const params = {
        where: { status: BookingStatus.COMPLETED },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
        skip: 0,
      };
      const mockBookings = [BookingFactory.createCompleted()];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findMany(params as any);

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith(params);
    });

    it('should handle complex where conditions', async () => {
      // Arrange
      const params = {
        where: {
          AND: [
            { status: { in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED] } },
            { customerId: 'customer-123' },
            { driverId: { not: null } },
            { createdAt: { gte: new Date('2024-01-01') } },
          ],
        },
        include: {
          customer: { select: { name: true, phone: true } },
          driver: { select: { name: true, driverProfile: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { status: 'asc' }],
        take: 20,
        skip: 40,
      };
      const mockBookings = [BookingFactory.createCompleted()];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findMany(params as any);

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith(params);
    });

    it('should handle database errors', async () => {
      // Arrange
      const params = { where: { status: BookingStatus.COMPLETED } };
      const error = new Error('Database query failed');
      prismaService.booking.findMany.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findMany(params)).rejects.toThrow('Database query failed');
    });

    it('should return empty array when no results', async () => {
      // Arrange
      const params = { where: { status: BookingStatus.COMPLETED } };
      prismaService.booking.findMany.mockResolvedValue([]);

      // Act
      const result = await repository.findMany(params);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle minimal parameters', async () => {
      // Arrange
      const params = { where: {} };
      const mockBookings = [BookingFactory.create()];
      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);

      // Act
      const result = await repository.findMany(params);

      // Assert
      expect(result).toEqual(mockBookings);
      expect(prismaService.booking.findMany).toHaveBeenCalledWith(params);
    });
  });

  describe('groupBy', () => {
    it('should group bookings successfully', async () => {
      // Arrange
      const params = {
        by: ['status'] as any,
        where: {
          status: {
            in: [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.ONGOING],
          },
        },
        _count: { status: true },
      };
      const mockGroupResult = [
        { status: BookingStatus.PENDING, _count: { status: 5 } },
        { status: BookingStatus.ACCEPTED, _count: { status: 3 } },
        { status: BookingStatus.ONGOING, _count: { status: 2 } },
      ];
      prismaService.booking.groupBy.mockResolvedValue(mockGroupResult as any);

      // Act
      const result = await repository.groupBy(params);

      // Assert
      expect(result).toEqual(mockGroupResult);
      expect(prismaService.booking.groupBy).toHaveBeenCalledWith(params);
    });

    it('should group by multiple fields', async () => {
      // Arrange
      const params = {
        by: ['status', 'customerId'] as any,
        where: {
          createdAt: { gte: new Date('2024-01-01') },
        },
        _count: { id: true },
        _avg: { pickupLat: true },
      };
      const mockGroupResult = [
        {
          status: BookingStatus.COMPLETED,
          customerId: 'customer-1',
          _count: { id: 3 },
          _avg: { pickupLat: -6.2 },
        },
        {
          status: BookingStatus.COMPLETED,
          customerId: 'customer-2',
          _count: { id: 2 },
          _avg: { pickupLat: -6.3 },
        },
      ];
      prismaService.booking.groupBy.mockResolvedValue(mockGroupResult as any);

      // Act
      const result = await repository.groupBy(params);

      // Assert
      expect(result).toEqual(mockGroupResult);
      expect(prismaService.booking.groupBy).toHaveBeenCalledWith(params);
    });

    it('should handle database errors', async () => {
      // Arrange
      const params = {
        by: ['status'] as any,
        where: {},
        _count: { status: true },
      };
      const error = new Error('Database groupBy failed');
      prismaService.booking.groupBy.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.groupBy(params)).rejects.toThrow('Database groupBy failed');
    });

    it('should return empty array when no data to group', async () => {
      // Arrange
      const params = {
        by: ['status'] as any,
        where: { customerId: 'nonexistent-customer' },
        _count: { status: true },
      };
      prismaService.booking.groupBy.mockResolvedValue([]);

      // Act
      const result = await repository.groupBy(params);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle complex aggregations', async () => {
      // Arrange
      const params = {
        by: ['status'] as any,
        where: {
          driverId: { not: null },
          createdAt: { gte: new Date('2024-01-01') },
        },
        _count: { id: true },
        _sum: { pickupLat: true },
        _avg: { destinationLat: true },
        _min: { createdAt: true },
        _max: { updatedAt: true },
      };
      const mockGroupResult = [
        {
          status: BookingStatus.COMPLETED,
          _count: { id: 10 },
          _sum: { pickupLat: -62.0 },
          _avg: { destinationLat: -6.19 },
          _min: { createdAt: new Date('2024-01-01') },
          _max: { updatedAt: new Date('2024-01-31') },
        },
      ];
      prismaService.booking.groupBy.mockResolvedValue(mockGroupResult as any);

      // Act
      const result = await repository.groupBy(params);

      // Assert
      expect(result).toEqual(mockGroupResult);
    });
  });

  describe('findFirst', () => {
    it('should find first booking successfully', async () => {
      // Arrange
      const query = {
        where: { customerId: 'customer-123' },
        select: { id: true, status: true },
      };
      const mockResult = { id: 'booking-123', status: BookingStatus.PENDING };
      prismaService.booking.findFirst.mockResolvedValue(mockResult as any);

      // Act
      const result = await repository.findFirst(query);

      // Assert
      expect(result).toEqual(mockResult);
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: query.where,
        select: query.select,
      });
    });

    it('should return null when no booking found', async () => {
      // Arrange
      const query = {
        where: { customerId: 'nonexistent-customer' },
        select: { id: true, status: true },
      };
      prismaService.booking.findFirst.mockResolvedValue(null);

      // Act
      const result = await repository.findFirst(query);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      // Arrange
      const query = {
        where: { customerId: 'customer-123' },
        select: { id: true, status: true },
      };
      const error = new Error('Database findFirst failed');
      prismaService.booking.findFirst.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.findFirst(query)).rejects.toThrow('Database findFirst failed');
    });

    it('should handle complex queries', async () => {
      // Arrange
      const query = {
        where: {
          AND: [
            { driverId: 'driver-123' },
            { status: { in: [BookingStatus.ACCEPTED, BookingStatus.ONGOING] } },
            { createdAt: { gte: new Date('2024-01-01') } },
          ],
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      };
      const mockResult = {
        id: 'booking-123',
        status: BookingStatus.ACCEPTED,
        createdAt: new Date('2024-01-01'),
        customer: { name: 'John Doe' },
      };
      prismaService.booking.findFirst.mockResolvedValue(mockResult as any);

      // Act
      const result = await repository.findFirst(query);

      // Assert
      expect(result).toEqual(mockResult);
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: query.where,
        select: query.select,
      });
    });

    it('should handle queries without select', async () => {
      // Arrange
      const query = {
        where: { customerId: 'customer-123' },
      };
      const mockResult = BookingFactory.create();
      prismaService.booking.findFirst.mockResolvedValue(mockResult as any);

      // Act
      const result = await repository.findFirst(query as any);

      // Assert
      expect(result).toEqual(mockResult);
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: query.where,
        select: undefined,
      });
    });
  });

  describe('updateWithCondition', () => {
    it('should update booking with condition successfully', async () => {
      // Arrange
      const updateData = {
        status: BookingStatus.ACCEPTED,
        driverId: 'driver-123',
        acceptedAt: new Date(),
      };
      const conditions = {
        status: BookingStatus.PENDING,
        driverId: null,
      };
      const updatedBooking = BookingFactory.createAccepted({ driverId: 'driver-123' });

      prismaService.booking.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaService.booking.findUnique.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(prismaService.booking.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'booking-123',
          ...conditions,
        },
        data: updateData,
      });
      expect(prismaService.booking.findUnique).toHaveBeenCalledWith({
        where: { id: 'booking-123' },
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    it('should return null when condition not met', async () => {
      // Arrange
      const updateData = {
        status: BookingStatus.ACCEPTED,
        driverId: 'driver-123',
      };
      const conditions = {
        status: BookingStatus.PENDING,
        driverId: null,
      };

      prismaService.booking.updateMany.mockResolvedValue({ count: 0 } as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toBeNull();
      expect(prismaService.booking.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'booking-123',
          ...conditions,
        },
        data: updateData,
      });
      expect(prismaService.booking.findUnique).not.toHaveBeenCalled();
    });

    it('should handle updateMany errors', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const conditions = { status: BookingStatus.PENDING };
      const error = new Error('Database updateMany failed');
      prismaService.booking.updateMany.mockRejectedValue(error);

      // Act & Assert
      await expect(repository.updateWithCondition('booking-123', updateData, conditions)).rejects.toThrow(
        'Database updateMany failed',
      );
    });

    it('should handle findUnique errors after successful update', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const conditions = { status: BookingStatus.PENDING };

      prismaService.booking.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaService.booking.findUnique.mockRejectedValue(new Error('Database findUnique failed'));

      // Act & Assert
      await expect(repository.updateWithCondition('booking-123', updateData, conditions)).rejects.toThrow(
        'Database findUnique failed',
      );
    });

    it('should handle multiple records updated (edge case)', async () => {
      // Arrange
      const updateData = { status: BookingStatus.CANCELLED };
      const conditions = { customerId: 'customer-123' }; // Broad condition
      const updatedBooking = BookingFactory.createCancelled();

      prismaService.booking.updateMany.mockResolvedValue({ count: 2 } as any); // Multiple records
      prismaService.booking.findUnique.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(prismaService.booking.findUnique).toHaveBeenCalled();
    });

    it('should handle complex conditions', async () => {
      // Arrange
      const updateData = {
        status: BookingStatus.ACCEPTED,
        driverId: 'driver-123',
        acceptedAt: new Date(),
      };
      const conditions = {
        AND: [{ status: BookingStatus.PENDING }, { driverId: null }, { createdAt: { gte: new Date('2024-01-01') } }],
      };
      const updatedBooking = BookingFactory.createAccepted();

      prismaService.booking.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaService.booking.findUnique.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(prismaService.booking.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'booking-123',
          ...conditions,
        },
        data: updateData,
      });
    });

    it('should handle race condition scenario', async () => {
      // Arrange
      const updateData = {
        status: BookingStatus.ACCEPTED,
        driverId: 'driver-123',
      };
      const conditions = {
        status: BookingStatus.PENDING,
        driverId: null,
      };

      // Simulate race condition - booking was taken by another driver
      prismaService.booking.updateMany.mockResolvedValue({ count: 0 } as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toBeNull(); // Should indicate condition not met
    });
  });
});
