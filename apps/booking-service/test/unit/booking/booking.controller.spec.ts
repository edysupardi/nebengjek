import { BookingController } from '@app/booking/booking.controller';
import { BookingService } from '@app/booking/booking.service';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { UpdateBookingStatusDto } from '@app/booking/dto/update-booking-status.dto';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('BookingController', () => {
  let controller: BookingController;
  let bookingService: jest.Mocked<BookingService>;

  const mockUser = {
    userId: 'user-123',
    role: 'customer',
  };

  const mockDriverUser = {
    userId: 'driver-123',
    role: 'driver',
  };

  const mockBooking = {
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
    customer: {
      id: 'user-123',
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

  const mockUpdateBookingStatusDto: UpdateBookingStatusDto = {
    status: BookingStatus.ACCEPTED,
  };

  beforeEach(async () => {
    const mockBookingService = {
      createBooking: jest.fn(),
      getBookingDetails: jest.fn(),
      getUserBookings: jest.fn(),
      updateBookingStatus: jest.fn(),
      acceptBooking: jest.fn(),
      rejectBooking: jest.fn(),
      cancelBooking: jest.fn(),
      deleteBooking: jest.fn(),
      completeBookingFromTrip: jest.fn(),
      checkMultipleDriversAvailability: jest.fn(),
      getCustomerBookingHistory: jest.fn(),
      getCustomerCancelledBookings: jest.fn(),
      getActiveBookingStatistics: jest.fn(),
      hasActiveBooking: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        {
          provide: BookingService,
          useValue: mockBookingService,
        },
      ],
    }).compile();

    controller = module.get<BookingController>(BookingController);
    bookingService = module.get(BookingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    it('should create booking successfully', async () => {
      // Arrange
      bookingService.createBooking.mockResolvedValue(mockBooking as any);

      // Act
      const result = await controller.createBooking(mockUser, mockCreateBookingDto);

      // Assert
      expect(result).toEqual(mockBooking);
      expect(bookingService.createBooking).toHaveBeenCalledWith(mockUser.userId, mockCreateBookingDto);
    });

    it('should handle service errors', async () => {
      // Arrange
      bookingService.createBooking.mockRejectedValue(new BadRequestException('You already have an active booking'));

      // Act & Assert
      await expect(controller.createBooking(mockUser, mockCreateBookingDto)).rejects.toThrow(BadRequestException);
    });

    it('should handle validation errors', async () => {
      // Arrange
      const invalidDto = {
        pickupLatitude: 91, // Invalid latitude > 90
        pickupLongitude: 106.8456,
        destinationLatitude: -6.1944,
        destinationLongitude: 106.8229,
      } as CreateBookingDto;

      bookingService.createBooking.mockRejectedValue(new BadRequestException('Invalid coordinates'));

      // Act & Assert
      await expect(controller.createBooking(mockUser, invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBookingDetails', () => {
    it('should get booking details successfully', async () => {
      // Arrange
      bookingService.getBookingDetails.mockResolvedValue(mockBooking as any);

      // Act
      const result = await controller.getBookingDetails('booking-123');

      // Assert
      expect(result).toEqual(mockBooking);
      expect(bookingService.getBookingDetails).toHaveBeenCalledWith('booking-123');
    });

    it('should handle booking not found', async () => {
      // Arrange
      bookingService.getBookingDetails.mockRejectedValue(new NotFoundException('Booking not found'));

      // Act & Assert
      await expect(controller.getBookingDetails('nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle service errors', async () => {
      // Arrange
      bookingService.getBookingDetails.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(controller.getBookingDetails('booking-123')).rejects.toThrow('Database error');
    });
  });

  describe('getUserBookings', () => {
    it('should get user bookings with default parameters', async () => {
      // Arrange
      const mockResponse = {
        data: [mockBooking],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          pages: 1,
        },
      };
      bookingService.getUserBookings.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getUserBookings(mockUser);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(bookingService.getUserBookings).toHaveBeenCalledWith(mockUser.userId, undefined, undefined, undefined);
    });

    it('should get user bookings with custom parameters', async () => {
      // Arrange
      const mockResponse = {
        data: [mockBooking],
        meta: {
          total: 1,
          page: 2,
          limit: 5,
          pages: 1,
        },
      };
      bookingService.getUserBookings.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getUserBookings(mockUser, BookingStatus.PENDING, 2, 5);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(bookingService.getUserBookings).toHaveBeenCalledWith(mockUser.userId, BookingStatus.PENDING, 2, 5);
    });

    it('should handle service errors', async () => {
      // Arrange
      bookingService.getUserBookings.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(controller.getUserBookings(mockUser)).rejects.toThrow('Database error');
    });
  });

  describe('updateBookingStatus', () => {
    it('should update booking status successfully', async () => {
      // Arrange
      const updatedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
      bookingService.updateBookingStatus.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await controller.updateBookingStatus(mockUser, 'booking-123', mockUpdateBookingStatusDto);

      // Assert
      expect(result).toEqual(updatedBooking);
      expect(bookingService.updateBookingStatus).toHaveBeenCalledWith(
        'booking-123',
        mockUser.userId,
        BookingStatus.ACCEPTED,
      );
    });

    it('should handle unauthorized access', async () => {
      // Arrange
      bookingService.updateBookingStatus.mockRejectedValue(
        new UnauthorizedException('You are not authorized to update this booking'),
      );

      // Act & Assert
      await expect(controller.updateBookingStatus(mockUser, 'booking-123', mockUpdateBookingStatusDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle booking not found', async () => {
      // Arrange
      bookingService.updateBookingStatus.mockRejectedValue(new NotFoundException('Booking not found'));

      // Act & Assert
      await expect(
        controller.updateBookingStatus(mockUser, 'nonexistent-booking', mockUpdateBookingStatusDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle invalid status transition', async () => {
      // Arrange
      bookingService.updateBookingStatus.mockRejectedValue(
        new BadRequestException('Cannot change status of a completed booking'),
      );

      // Act & Assert
      await expect(controller.updateBookingStatus(mockUser, 'booking-123', mockUpdateBookingStatusDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptBooking', () => {
    it('should accept booking successfully', async () => {
      // Arrange
      const acceptedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
      bookingService.acceptBooking.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await controller.acceptBooking(mockDriverUser, 'booking-123');

      // Assert
      expect(result).toEqual(acceptedBooking);
      expect(bookingService.acceptBooking).toHaveBeenCalledWith('booking-123', mockDriverUser.userId);
    });

    it('should handle booking already accepted', async () => {
      // Arrange
      bookingService.acceptBooking.mockRejectedValue(
        new BadRequestException('Booking has already been accepted by another driver'),
      );

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });

    it('should handle driver not eligible', async () => {
      // Arrange
      bookingService.acceptBooking.mockRejectedValue(
        new UnauthorizedException('You are not eligible to accept this booking'),
      );

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'booking-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle driver has active booking', async () => {
      // Arrange
      bookingService.acceptBooking.mockRejectedValue(
        new BadRequestException('You already have an active booking or trip'),
      );

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectBooking', () => {
    it('should reject booking successfully', async () => {
      // Arrange
      const mockResponse = { message: 'Booking rejected successfully' };
      bookingService.rejectBooking.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.rejectBooking(mockDriverUser, 'booking-123');

      // Assert
      expect(result).toEqual(mockResponse);
      expect(bookingService.rejectBooking).toHaveBeenCalledWith('booking-123', mockDriverUser.userId);
    });

    it('should handle booking not found', async () => {
      // Arrange
      bookingService.rejectBooking.mockRejectedValue(new NotFoundException('Booking not found'));

      // Act & Assert
      await expect(controller.rejectBooking(mockDriverUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle booking not pending', async () => {
      // Arrange
      bookingService.rejectBooking.mockRejectedValue(
        new BadRequestException('Cannot reject booking with status accepted'),
      );

      // Act & Assert
      await expect(controller.rejectBooking(mockDriverUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking successfully', async () => {
      // Arrange
      const cancelledBooking = { ...mockBooking, status: BookingStatus.CANCELLED };
      bookingService.cancelBooking.mockResolvedValue(cancelledBooking as any);

      // Act
      const result = await controller.cancelBooking(mockUser, 'booking-123');

      // Assert
      expect(result).toEqual(cancelledBooking);
      expect(bookingService.cancelBooking).toHaveBeenCalledWith('booking-123', mockUser.userId);
    });

    it('should handle booking not found', async () => {
      // Arrange
      bookingService.cancelBooking.mockRejectedValue(new NotFoundException('Booking not found'));

      // Act & Assert
      await expect(controller.cancelBooking(mockUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle unauthorized cancellation', async () => {
      // Arrange
      bookingService.cancelBooking.mockRejectedValue(
        new UnauthorizedException('You are not authorized to cancel this booking'),
      );

      // Act & Assert
      await expect(controller.cancelBooking(mockUser, 'booking-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle invalid status for cancellation', async () => {
      // Arrange
      bookingService.cancelBooking.mockRejectedValue(
        new BadRequestException('Cannot cancel booking with status completed'),
      );

      // Act & Assert
      await expect(controller.cancelBooking(mockUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteBooking', () => {
    it('should delete booking successfully', async () => {
      // Arrange
      const mockResponse = { message: 'Booking deleted successfully' };
      bookingService.deleteBooking.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.deleteBooking(mockUser, 'booking-123');

      // Assert
      expect(result).toEqual(mockResponse);
      expect(bookingService.deleteBooking).toHaveBeenCalledWith('booking-123', mockUser.userId);
    });

    it('should handle booking not found', async () => {
      // Arrange
      bookingService.deleteBooking.mockRejectedValue(new NotFoundException('Booking not found'));

      // Act & Assert
      await expect(controller.deleteBooking(mockUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle unauthorized deletion', async () => {
      // Arrange
      bookingService.deleteBooking.mockRejectedValue(
        new UnauthorizedException('Only the customer can delete a booking'),
      );

      // Act & Assert
      await expect(controller.deleteBooking(mockUser, 'booking-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle invalid status for deletion', async () => {
      // Arrange
      bookingService.deleteBooking.mockRejectedValue(
        new BadRequestException('Cannot delete booking with status pending'),
      );

      // Act & Assert
      await expect(controller.deleteBooking(mockUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateBookingStatusTcp', () => {
    it('should update booking status to ONGOING via TCP successfully', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        userId: 'driver-123',
        startedAt: new Date(),
      };
      const updatedBooking = { ...mockBooking, status: BookingStatus.ONGOING };
      bookingService.updateBookingStatus.mockResolvedValue(updatedBooking as any);

      // Act
      const result = await controller.updateBookingStatusTcp(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'Booking updated to ONGOING',
        data: updatedBooking,
      });
      expect(bookingService.updateBookingStatus).toHaveBeenCalledWith(
        tcpData.bookingId,
        tcpData.userId,
        BookingStatus.ONGOING,
        tcpData.startedAt,
      );
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        userId: 'driver-123',
      };
      bookingService.updateBookingStatus.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.updateBookingStatusTcp(tcpData);

      // Assert
      expect(result).toBeUndefined(); // Method doesn't return anything on error
    });

    it('should handle unknown errors', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        userId: 'driver-123',
      };
      bookingService.updateBookingStatus.mockRejectedValue('Unknown error');

      // Act
      const result = await controller.updateBookingStatusTcp(tcpData);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('completeBooking', () => {
    it('should complete booking via TCP successfully', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        completedAt: new Date(),
      };
      const completedBooking = { ...mockBooking, status: BookingStatus.COMPLETED };
      bookingService.completeBookingFromTrip.mockResolvedValue(completedBooking as any);

      // Act
      const result = await controller.completeBooking(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'Booking completed',
        data: completedBooking,
      });
      expect(bookingService.completeBookingFromTrip).toHaveBeenCalledWith(tcpData.bookingId, tcpData.completedAt);
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        completedAt: new Date(),
      };
      bookingService.completeBookingFromTrip.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.completeBooking(tcpData);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('checkDriversAvailability', () => {
    it('should check drivers availability successfully', async () => {
      // Arrange
      const tcpData = { driverIds: ['driver-1', 'driver-2'] };
      const availabilityData = [
        { driverId: 'driver-1', isAvailable: true, activeBooking: null },
        { driverId: 'driver-2', isAvailable: false, activeBooking: mockBooking },
      ];
      bookingService.checkMultipleDriversAvailability.mockResolvedValue(availabilityData);

      // Act
      const result = await controller.checkDriversAvailability(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        data: availabilityData,
      });
      expect(bookingService.checkMultipleDriversAvailability).toHaveBeenCalledWith(tcpData.driverIds);
    });

    it('should handle service errors', async () => {
      // Arrange
      const tcpData = { driverIds: ['driver-1'] };
      bookingService.checkMultipleDriversAvailability.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.checkDriversAvailability(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: [],
      });
    });

    it('should handle unknown errors', async () => {
      // Arrange
      const tcpData = { driverIds: ['driver-1'] };
      bookingService.checkMultipleDriversAvailability.mockRejectedValue('Unknown error');

      // Act
      const result = await controller.checkDriversAvailability(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'An unknown error occurred',
        data: [],
      });
    });
  });

  describe('getCustomerBookingHistory', () => {
    it('should get customer booking history successfully', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
        limit: 50,
      };
      const historyData = [mockBooking];
      bookingService.getCustomerBookingHistory.mockResolvedValue(historyData);

      // Act
      const result = await controller.getCustomerBookingHistory(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        data: historyData,
      });
      expect(bookingService.getCustomerBookingHistory).toHaveBeenCalledWith(
        tcpData.customerId,
        tcpData.daysBack,
        tcpData.limit,
      );
    });

    it('should use default limit when not provided', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
      };
      bookingService.getCustomerBookingHistory.mockResolvedValue([]);

      // Act
      await controller.getCustomerBookingHistory(tcpData);

      // Assert
      expect(bookingService.getCustomerBookingHistory).toHaveBeenCalledWith(
        tcpData.customerId,
        tcpData.daysBack,
        50, // default limit
      );
    });

    it('should handle service errors', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
      };
      bookingService.getCustomerBookingHistory.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.getCustomerBookingHistory(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: [],
      });
    });
  });

  describe('getCustomerCancelledBookings', () => {
    it('should get customer cancelled bookings successfully', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
      };
      const cancelledBookings = [{ ...mockBooking, status: BookingStatus.CANCELLED }];
      bookingService.getCustomerCancelledBookings.mockResolvedValue(cancelledBookings);

      // Act
      const result = await controller.getCustomerCancelledBookings(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        data: cancelledBookings,
      });
      expect(bookingService.getCustomerCancelledBookings).toHaveBeenCalledWith(tcpData.customerId, tcpData.daysBack);
    });

    it('should handle service errors', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
      };
      bookingService.getCustomerCancelledBookings.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.getCustomerCancelledBookings(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: [],
      });
    });
  });

  describe('getActiveBookingStats', () => {
    it('should get active booking statistics successfully', async () => {
      // Arrange
      const statsData = {
        totalActive: 10,
        byStatus: {
          [BookingStatus.PENDING]: 5,
          [BookingStatus.ACCEPTED]: 3,
          [BookingStatus.ONGOING]: 2,
        },
      };
      bookingService.getActiveBookingStatistics.mockResolvedValue(statsData);

      // Act
      const result = await controller.getActiveBookingStats();

      // Assert
      expect(result).toEqual({
        success: true,
        data: statsData,
      });
      expect(bookingService.getActiveBookingStatistics).toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      // Arrange
      bookingService.getActiveBookingStatistics.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.getActiveBookingStats();

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: {},
      });
    });
  });

  describe('checkDriverActiveBooking', () => {
    it('should check driver active booking successfully', async () => {
      // Arrange
      const tcpData = { driverId: 'driver-123' };
      bookingService.hasActiveBooking.mockResolvedValue(false);

      // Act
      const result = await controller.checkDriverActiveBooking(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          driverId: 'driver-123',
          hasActiveBooking: false,
        },
      });
      expect(bookingService.hasActiveBooking).toHaveBeenCalledWith('driver-123');
    });

    it('should return true when driver has active booking', async () => {
      // Arrange
      const tcpData = { driverId: 'driver-123' };
      bookingService.hasActiveBooking.mockResolvedValue(true);

      // Act
      const result = await controller.checkDriverActiveBooking(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          driverId: 'driver-123',
          hasActiveBooking: true,
        },
      });
    });

    it('should handle service errors with fail safe', async () => {
      // Arrange
      const tcpData = { driverId: 'driver-123' };
      bookingService.hasActiveBooking.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await controller.checkDriverActiveBooking(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: {
          driverId: 'driver-123',
          hasActiveBooking: true, // Fail safe
        },
      });
    });

    it('should handle unknown errors with fail safe', async () => {
      // Arrange
      const tcpData = { driverId: 'driver-123' };
      bookingService.hasActiveBooking.mockRejectedValue('Unknown error');

      // Act
      const result = await controller.checkDriverActiveBooking(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'An unknown error occurred',
        data: {
          driverId: 'driver-123',
          hasActiveBooking: true, // Fail safe
        },
      });
    });
  });
});
