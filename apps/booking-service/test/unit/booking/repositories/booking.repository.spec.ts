import { BookingRepository } from '@app/booking/repositories/booking.repository';
import { DriverProfile, UserRole } from '@app/common';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { PrismaService } from '@app/database';
import { Test, TestingModule } from '@nestjs/testing';
import { Booking, User } from '@prisma/client';

describe('BookingRepository', () => {
  let repository: BookingRepository;
  let prismaService: jest.Mocked<PrismaService>;

  const mockUser: User = {
    id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+6281234567890',
    role: UserRole.CUSTOMER,
    createdAt: new Date(),
    updatedAt: new Date(),
    password: 'hashed-password',
  };

  const mockDriver: User = {
    id: 'driver-123',
    name: 'Driver Name',
    email: 'driver@example.com',
    phone: '+6281234567891',
    password: 'hashed-password',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: UserRole.DRIVER,
  };

  const mockDriverProfile: DriverProfile = {
    id: 'driver-profile-123',
    userId: 'driver-123',
    vehicleType: 'motorcycle',
    plateNumber: 'B1234XYZ',
    rating: 4.5,
    lastLatitude: -6.2088,
    lastLongitude: 106.8456,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: true,
  };

  const mockBooking: Booking = {
    id: 'booking-123',
    customerId: 'user-123',
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
    updatedAt: new Date(),
  };

  const mockBookingWithRelations = {
    ...mockBooking,
    customer: mockUser,
    driver: {
      ...mockDriver,
      driverProfile: mockDriverProfile,
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      booking: {
        create: jest.fn().mockReturnThis(),
        findUnique: jest.fn().mockReturnThis(),
        findFirst: jest.fn().mockReturnThis(),
        findMany: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        updateMany: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
      },
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
        customerId: 'user-123',
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

    it('should handle create errors', async () => {
      // Arrange
      const createData = {
        customerId: 'user-123',
        pickupLat: -6.2088,
        pickupLng: 106.8456,
        destinationLat: -6.1944,
        destinationLng: 106.8229,
        status: BookingStatus.PENDING,
      };
      prismaService.booking.create.mockRejectedValue(new Error('Database connection error'));

      // Act & Assert
      await expect(repository.create(createData)).rejects.toThrow('Database connection error');
    });

    it('should handle unique constraint violations', async () => {
      // Arrange
      const createData = {
        customerId: 'user-123',
        pickupLat: -6.2088,
        pickupLng: 106.8456,
        destinationLat: -6.1944,
        destinationLng: 106.8229,
        status: BookingStatus.PENDING,
      };
      const uniqueConstraintError = new Error('Unique constraint failed');
      prismaService.booking.create.mockRejectedValue(uniqueConstraintError);

      // Act & Assert
      await expect(repository.create(createData)).rejects.toThrow('Unique constraint failed');
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
      prismaService.booking.findUnique.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.findById('booking-123')).rejects.toThrow('Database error');
    });
  });

  describe('update', () => {
    it('should update booking successfully', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED, acceptedAt: new Date() };
      const updatedBooking = { ...mockBookingWithRelations, ...updateData };
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

    it('should handle update errors', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      prismaService.booking.update.mockRejectedValue(new Error('Record not found'));

      // Act & Assert
      await expect(repository.update('nonexistent-booking', updateData)).rejects.toThrow('Record not found');
    });

    it('should handle optimistic concurrency errors', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const concurrencyError = new Error('The record was modified by another user');
      prismaService.booking.update.mockRejectedValue(concurrencyError);

      // Act & Assert
      await expect(repository.update('booking-123', updateData)).rejects.toThrow(
        'The record was modified by another user',
      );
    });
  });

  describe('delete', () => {
    it('should delete booking successfully', async () => {
      // Arrange
      prismaService.booking.delete.mockResolvedValue(mockBooking as any);

      // Act
      await repository.delete('booking-123');

      // Assert
      expect(prismaService.booking.delete).toHaveBeenCalledWith({
        where: { id: 'booking-123' },
      });
    });

    it('should handle delete errors', async () => {
      // Arrange
      prismaService.booking.delete.mockRejectedValue(new Error('Record not found'));

      // Act & Assert
      await expect(repository.delete('nonexistent-booking')).rejects.toThrow('Record not found');
    });

    it('should handle foreign key constraint violations', async () => {
      // Arrange
      const foreignKeyError = new Error('Foreign key constraint failed');
      prismaService.booking.delete.mockRejectedValue(foreignKeyError);

      // Act & Assert
      await expect(repository.delete('booking-123')).rejects.toThrow('Foreign key constraint failed');
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
      const mockBookings = [mockBookingWithRelations];
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

    it('should handle database errors', async () => {
      // Arrange
      prismaService.booking.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.findByUser('user-123')).rejects.toThrow('Database error');
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

    it('should handle database errors', async () => {
      // Arrange
      prismaService.booking.count.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.countByUser('user-123')).rejects.toThrow('Database error');
    });
  });

  describe('findActiveBookingByCustomer', () => {
    it('should find active booking by customer successfully', async () => {
      // Arrange
      const activeBooking = { ...mockBookingWithRelations, status: BookingStatus.ACCEPTED };
      prismaService.booking.findFirst.mockResolvedValue(activeBooking as any);

      // Act
      const result = await repository.findActiveBookingByCustomer('user-123');

      // Assert
      expect(result).toEqual(activeBooking);
      expect(prismaService.booking.findFirst).toHaveBeenCalledWith({
        where: {
          customerId: 'user-123',
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
      const result = await repository.findActiveBookingByCustomer('user-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      // Arrange
      prismaService.booking.findFirst.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.findActiveBookingByCustomer('user-123')).rejects.toThrow('Database error');
    });
  });

  describe('findActiveBookingByDriver', () => {
    it('should find active booking by driver successfully', async () => {
      // Arrange
      const activeBooking = { ...mockBookingWithRelations, status: BookingStatus.ONGOING };
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
      prismaService.booking.findFirst.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.findActiveBookingByDriver('driver-123')).rejects.toThrow('Database error');
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
      const mockBookings = [mockBookingWithRelations];
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
      prismaService.booking.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.findMany(params)).rejects.toThrow('Database error');
    });
  });

  describe('groupBy', () => {
    it('should group bookings successfully', async () => {
      // Arrange
      const params = {
        by: ['status'] as any,
        where: { status: { in: [BookingStatus.PENDING, BookingStatus.ACCEPTED] } },
        _count: { status: true },
      };
      const mockGroupResult = [
        { status: BookingStatus.PENDING, _count: { status: 5 } },
        { status: BookingStatus.ACCEPTED, _count: { status: 3 } },
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
      prismaService.booking.groupBy.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.groupBy(params)).rejects.toThrow('Database error');
    });
  });

  describe('findFirst', () => {
    it('should find first booking successfully', async () => {
      // Arrange
      const query = {
        where: { customerId: 'user-123' },
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
        where: { customerId: 'nonexistent-user' },
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
        where: { customerId: 'user-123' },
        select: { id: true, status: true },
      };
      prismaService.booking.findFirst.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.findFirst(query)).rejects.toThrow('Database error');
    });
  });

  describe('updateWithCondition', () => {
    it('should update booking with condition successfully', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED, driverId: 'driver-123' };
      const conditions = { status: BookingStatus.PENDING, driverId: null };
      prismaService.booking.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaService.booking.findUnique.mockResolvedValue(mockBookingWithRelations as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toEqual(mockBookingWithRelations);
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
      const updateData = { status: BookingStatus.ACCEPTED, driverId: 'driver-123' };
      const conditions = { status: BookingStatus.PENDING, driverId: null };
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
      prismaService.booking.updateMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.updateWithCondition('booking-123', updateData, conditions)).rejects.toThrow(
        'Database error',
      );
    });

    it('should handle findUnique errors after successful update', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const conditions = { status: BookingStatus.PENDING };
      prismaService.booking.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaService.booking.findUnique.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(repository.updateWithCondition('booking-123', updateData, conditions)).rejects.toThrow(
        'Database error',
      );
    });

    it('should handle zero count update gracefully', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const conditions = { status: BookingStatus.COMPLETED }; // Invalid transition
      prismaService.booking.updateMany.mockResolvedValue({ count: 0 } as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toBeNull();
      expect(prismaService.booking.findUnique).not.toHaveBeenCalled();
    });

    it('should handle multiple records updated (should not happen in practice)', async () => {
      // Arrange
      const updateData = { status: BookingStatus.ACCEPTED };
      const conditions = { status: BookingStatus.PENDING };
      prismaService.booking.updateMany.mockResolvedValue({ count: 2 } as any);
      prismaService.booking.findUnique.mockResolvedValue(mockBookingWithRelations as any);

      // Act
      const result = await repository.updateWithCondition('booking-123', updateData, conditions);

      // Assert
      expect(result).toEqual(mockBookingWithRelations);
      expect(prismaService.booking.findUnique).toHaveBeenCalled();
    });
  });
});
