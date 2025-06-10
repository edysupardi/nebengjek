// apps/booking-service/test/unit/booking/booking.controller.spec.ts
import { BookingController } from '@app/booking/booking.controller';
import { BookingService } from '@app/booking/booking.service';
import { CreateBookingDto } from '@app/booking/dto/create-booking.dto';
import { UpdateBookingStatusDto } from '@app/booking/dto/update-booking-status.dto';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingFactory } from '../../mocks';

describe('BookingController', () => {
  let controller: BookingController;
  let bookingService: jest.Mocked<BookingService>;

  const mockUser = {
    userId: 'customer-123',
    role: 'customer',
  };

  const mockDriverUser = {
    userId: 'driver-123',
    role: 'driver',
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
      smartCancelBooking: jest.fn(),
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
      const mockBooking = BookingFactory.createWithRelations({ customerId: mockUser.userId });
      bookingService.createBooking.mockResolvedValue(mockBooking as any);

      // Act
      const result = await controller.createBooking(mockUser, mockCreateBookingDto);

      // Assert
      expect(result).toEqual(mockBooking);
      expect(bookingService.createBooking).toHaveBeenCalledWith(mockUser.userId, mockCreateBookingDto);
      expect(bookingService.createBooking).toHaveBeenCalledTimes(1);
    });

    it('should handle BadRequestException when customer has active booking', async () => {
      // Arrange
      const error = new BadRequestException('You already have an active booking');
      bookingService.createBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.createBooking(mockUser, mockCreateBookingDto)).rejects.toThrow(BadRequestException);
      expect(bookingService.createBooking).toHaveBeenCalledWith(mockUser.userId, mockCreateBookingDto);
    });

    it('should handle validation errors for invalid coordinates', async () => {
      // Arrange
      const invalidDto = {
        ...mockCreateBookingDto,
        pickupLatitude: 91, // Invalid latitude > 90
      } as CreateBookingDto;
      const error = new BadRequestException('Invalid coordinates');
      bookingService.createBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.createBooking(mockUser, invalidDto)).rejects.toThrow(BadRequestException);
      expect(bookingService.createBooking).toHaveBeenCalledWith(mockUser.userId, invalidDto);
    });

    it('should handle service errors', async () => {
      // Arrange
      const error = new Error('Database connection error');
      bookingService.createBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.createBooking(mockUser, mockCreateBookingDto)).rejects.toThrow(
        'Database connection error',
      );
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      bookingService.createBooking.mockRejectedValue('Unknown error');

      // Act & Assert
      await expect(controller.createBooking(mockUser, mockCreateBookingDto)).rejects.toThrow();
    });
  });

  describe('getBookingDetails', () => {
    it('should get booking details successfully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations();
      bookingService.getBookingDetails.mockResolvedValue(mockBooking as any);

      // Act
      const result = await controller.getBookingDetails('booking-123');

      // Assert
      expect(result).toEqual(mockBooking);
      expect(bookingService.getBookingDetails).toHaveBeenCalledWith('booking-123');
      expect(bookingService.getBookingDetails).toHaveBeenCalledTimes(1);
    });

    it('should handle booking not found', async () => {
      // Arrange
      const error = new NotFoundException('Booking not found');
      bookingService.getBookingDetails.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getBookingDetails('nonexistent-booking')).rejects.toThrow(NotFoundException);
      expect(bookingService.getBookingDetails).toHaveBeenCalledWith('nonexistent-booking');
    });

    it('should handle service errors', async () => {
      // Arrange
      const error = new Error('Database error');
      bookingService.getBookingDetails.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getBookingDetails('booking-123')).rejects.toThrow('Database error');
    });

    it('should handle empty booking ID', async () => {
      // Arrange
      const error = new BadRequestException('Invalid booking ID');
      bookingService.getBookingDetails.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getBookingDetails('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserBookings', () => {
    it('should get user bookings with default parameters', async () => {
      // Arrange
      const mockResponse = {
        data: [BookingFactory.createWithRelations({ customerId: mockUser.userId })],
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
        data: [BookingFactory.createWithRelations({ customerId: mockUser.userId, status: BookingStatus.PENDING })],
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

    it('should handle negative page numbers', async () => {
      // Arrange
      const mockResponse = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, pages: 0 },
      };
      bookingService.getUserBookings.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getUserBookings(mockUser, undefined, -1, 10);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(bookingService.getUserBookings).toHaveBeenCalledWith(mockUser.userId, undefined, -1, 10);
    });

    it('should handle large limit values', async () => {
      // Arrange
      const mockResponse = {
        data: [],
        meta: { total: 0, page: 1, limit: 1000, pages: 0 },
      };
      bookingService.getUserBookings.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getUserBookings(mockUser, undefined, 1, 1000);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(bookingService.getUserBookings).toHaveBeenCalledWith(mockUser.userId, undefined, 1, 1000);
    });

    it('should handle service errors', async () => {
      // Arrange
      const error = new Error('Database error');
      bookingService.getUserBookings.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getUserBookings(mockUser)).rejects.toThrow('Database error');
    });
  });

  describe('updateBookingStatus', () => {
    it('should update booking status successfully', async () => {
      // Arrange
      const updatedBooking = BookingFactory.createAccepted({ customerId: mockUser.userId });
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
      const error = new UnauthorizedException('You are not authorized to update this booking');
      bookingService.updateBookingStatus.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.updateBookingStatus(mockUser, 'booking-123', mockUpdateBookingStatusDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle booking not found', async () => {
      // Arrange
      const error = new NotFoundException('Booking not found');
      bookingService.updateBookingStatus.mockRejectedValue(error);

      // Act & Assert
      await expect(
        controller.updateBookingStatus(mockUser, 'nonexistent-booking', mockUpdateBookingStatusDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle invalid status transition', async () => {
      // Arrange
      const error = new BadRequestException('Cannot change status of a completed booking');
      bookingService.updateBookingStatus.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.updateBookingStatus(mockUser, 'booking-123', mockUpdateBookingStatusDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptBooking', () => {
    it('should accept booking successfully', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({ driverId: mockDriverUser.userId });
      bookingService.acceptBooking.mockResolvedValue(acceptedBooking as any);

      // Act
      const result = await controller.acceptBooking(mockDriverUser, 'booking-123');

      // Assert
      expect(result).toEqual(acceptedBooking);
      expect(bookingService.acceptBooking).toHaveBeenCalledWith('booking-123', mockDriverUser.userId);
    });

    it('should handle booking already accepted', async () => {
      // Arrange
      const error = new BadRequestException('Booking has already been accepted by another driver');
      bookingService.acceptBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });

    it('should handle driver not eligible', async () => {
      // Arrange
      const error = new UnauthorizedException('You are not eligible to accept this booking');
      bookingService.acceptBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'booking-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle driver has active booking', async () => {
      // Arrange
      const error = new BadRequestException('You already have an active booking or trip');
      bookingService.acceptBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });

    it('should handle booking not found', async () => {
      // Arrange
      const error = new NotFoundException('Booking not found');
      bookingService.acceptBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.acceptBooking(mockDriverUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle lock acquisition failure', async () => {
      // Arrange
      const error = new BadRequestException(
        'Booking is currently being processed by another driver. Please try again.',
      );
      bookingService.acceptBooking.mockRejectedValue(error);

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
      const error = new NotFoundException('Booking not found');
      bookingService.rejectBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.rejectBooking(mockDriverUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle booking not pending', async () => {
      // Arrange
      const error = new BadRequestException('Cannot reject booking with status accepted');
      bookingService.rejectBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.rejectBooking(mockDriverUser, 'booking-123')).rejects.toThrow(BadRequestException);
    });

    it('should handle service errors', async () => {
      // Arrange
      const error = new Error('Redis connection error');
      bookingService.rejectBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.rejectBooking(mockDriverUser, 'booking-123')).rejects.toThrow('Redis connection error');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking successfully by customer', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: mockUser.userId });
      bookingService.cancelBooking.mockResolvedValue(cancelledBooking as any);

      // Act
      const result = await controller.cancelBooking(mockUser, 'booking-123');

      // Assert
      expect(result).toEqual(cancelledBooking);
      expect(bookingService.cancelBooking).toHaveBeenCalledWith('booking-123', mockUser.userId);
    });

    it('should cancel booking successfully by driver', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({
        customerId: mockUser.userId,
        driverId: mockDriverUser.userId,
      });
      bookingService.cancelBooking.mockResolvedValue(cancelledBooking as any);

      // Act
      const result = await controller.cancelBooking(mockDriverUser, 'booking-123');

      // Assert
      expect(result).toEqual(cancelledBooking);
      expect(bookingService.cancelBooking).toHaveBeenCalledWith('booking-123', mockDriverUser.userId);
    });

    it('should handle booking not found', async () => {
      // Arrange
      const error = new NotFoundException('Booking not found');
      bookingService.cancelBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.cancelBooking(mockUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle unauthorized cancellation', async () => {
      // Arrange
      const error = new UnauthorizedException('You are not authorized to cancel this booking');
      bookingService.cancelBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.cancelBooking(mockUser, 'booking-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle invalid status for cancellation', async () => {
      // Arrange
      const error = new BadRequestException('Cannot cancel booking with status completed');
      bookingService.cancelBooking.mockRejectedValue(error);

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
      const error = new NotFoundException('Booking not found');
      bookingService.deleteBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.deleteBooking(mockUser, 'nonexistent-booking')).rejects.toThrow(NotFoundException);
    });

    it('should handle unauthorized deletion', async () => {
      // Arrange
      const error = new UnauthorizedException('Only the customer can delete a booking');
      bookingService.deleteBooking.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.deleteBooking(mockDriverUser, 'booking-123')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle invalid status for deletion', async () => {
      // Arrange
      const error = new BadRequestException('Cannot delete booking with status pending');
      bookingService.deleteBooking.mockRejectedValue(error);

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
      const updatedBooking = BookingFactory.createOngoing({ driverId: tcpData.userId });
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

    it('should update booking status without startedAt', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        userId: 'driver-123',
      };
      const updatedBooking = BookingFactory.createOngoing({ driverId: tcpData.userId });
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
        undefined,
      );
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        userId: 'driver-123',
      };
      const error = new Error('Database error');
      bookingService.updateBookingStatus.mockRejectedValue(error);

      // Act
      const result = await controller.updateBookingStatusTcp(tcpData);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle unknown errors', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        userId: 'driver-123',
      };
      bookingService.updateBookingStatus.mockRejectedValue('Unknown error string');

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
      const completedBooking = BookingFactory.createCompleted();
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
      const error = new Error('Database error');
      bookingService.completeBookingFromTrip.mockRejectedValue(error);

      // Act
      const result = await controller.completeBooking(tcpData);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle unknown errors', async () => {
      // Arrange
      const tcpData = {
        bookingId: 'booking-123',
        completedAt: new Date(),
      };
      bookingService.completeBookingFromTrip.mockRejectedValue('Unknown error');

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
        { driverId: 'driver-2', isAvailable: false, activeBooking: BookingFactory.create() },
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

    it('should handle empty driver list', async () => {
      // Arrange
      const tcpData = { driverIds: [] };
      bookingService.checkMultipleDriversAvailability.mockResolvedValue([]);

      // Act
      const result = await controller.checkDriversAvailability(tcpData);

      // Assert
      expect(result).toEqual({
        success: true,
        data: [],
      });
    });

    it('should handle service errors', async () => {
      // Arrange
      const tcpData = { driverIds: ['driver-1'] };
      const error = new Error('Database error');
      bookingService.checkMultipleDriversAvailability.mockRejectedValue(error);

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
      const historyData = [BookingFactory.createCompleted({ customerId: tcpData.customerId })];
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
      const error = new Error('Database error');
      bookingService.getCustomerBookingHistory.mockRejectedValue(error);

      // Act
      const result = await controller.getCustomerBookingHistory(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: [],
      });
    });

    it('should handle unknown errors', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
      };
      bookingService.getCustomerBookingHistory.mockRejectedValue('Unknown error');

      // Act
      const result = await controller.getCustomerBookingHistory(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'An unknown error occurred',
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
      const cancelledBookings = [BookingFactory.createCancelled({ customerId: tcpData.customerId })];
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
      const error = new Error('Database error');
      bookingService.getCustomerCancelledBookings.mockRejectedValue(error);

      // Act
      const result = await controller.getCustomerCancelledBookings(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: [],
      });
    });

    it('should handle unknown errors', async () => {
      // Arrange
      const tcpData = {
        customerId: 'customer-123',
        daysBack: 30,
      };
      bookingService.getCustomerCancelledBookings.mockRejectedValue('Unknown error');

      // Act
      const result = await controller.getCustomerCancelledBookings(tcpData);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'An unknown error occurred',
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
      const error = new Error('Database error');
      bookingService.getActiveBookingStatistics.mockRejectedValue(error);

      // Act
      const result = await controller.getActiveBookingStats();

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Database error',
        data: {},
      });
    });

    it('should handle unknown errors', async () => {
      // Arrange
      bookingService.getActiveBookingStatistics.mockRejectedValue('Unknown error');

      // Act
      const result = await controller.getActiveBookingStats();

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'An unknown error occurred',
        data: {},
      });
    });
  });

  describe('checkDriverActiveBooking', () => {
    it('should check driver active booking successfully - no active booking', async () => {
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
      const error = new Error('Database error');
      bookingService.hasActiveBooking.mockRejectedValue(error);

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
