import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { PrismaService } from '@app/database';
import { MessagingService } from '@app/messaging';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { BookingModule } from '../../src/booking/booking.module';
import {
  BookingFactory,
  createMockClientProxy,
  createMockMessagingService,
  createMockRedisClient,
  mockCustomer,
  mockDriver,
} from '../mocks';

describe('Booking Integration Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let redisClient: any;
  let messagingService: MessagingService;

  const mockJwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Mock JWT token

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BookingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        booking: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
          groupBy: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
        },
        $transaction: jest.fn(),
      })
      .overrideProvider('REDIS_CLIENT')
      .useValue(createMockRedisClient())
      .overrideProvider('NOTIFICATION_SERVICE')
      .useValue(createMockClientProxy())
      .overrideProvider('MATCHING_SERVICE')
      .useValue(createMockClientProxy())
      .overrideProvider('TRACKING_SERVICE')
      .useValue(createMockClientProxy())
      .overrideProvider(MessagingService)
      .useValue(createMockMessagingService())
      .compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisClient = moduleFixture.get('REDIS_CLIENT');
    messagingService = moduleFixture.get<MessagingService>(MessagingService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /bookings', () => {
    const validCreateBookingDto = {
      pickupLatitude: -6.2088,
      pickupLongitude: 106.8456,
      destinationLatitude: -6.1944,
      destinationLongitude: 106.8229,
    };

    it('should create booking successfully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations();
      prismaService.booking.findFirst = jest.fn().mockResolvedValue(null); // No active booking
      prismaService.booking.create = jest.fn().mockResolvedValue(mockBooking);

      // Act
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send(validCreateBookingDto)
        .expect(201);

      // Assert
      expect(response.body).toMatchObject({
        id: expect.any(String),
        customerId: mockCustomer.id,
        status: BookingStatus.PENDING,
        pickupLat: validCreateBookingDto.pickupLatitude,
        pickupLng: validCreateBookingDto.pickupLongitude,
        destinationLat: validCreateBookingDto.destinationLatitude,
        destinationLng: validCreateBookingDto.destinationLongitude,
      });

      expect(prismaService.booking.create).toHaveBeenCalledWith({
        data: {
          customerId: mockCustomer.id,
          pickupLat: validCreateBookingDto.pickupLatitude,
          pickupLng: validCreateBookingDto.pickupLongitude,
          destinationLat: validCreateBookingDto.destinationLatitude,
          destinationLng: validCreateBookingDto.destinationLongitude,
          status: BookingStatus.PENDING,
        },
        include: expect.any(Object),
      });

      expect(messagingService.publish).toHaveBeenCalledTimes(2);
      expect(redisClient.hset).toHaveBeenCalled();
    });

    it('should return 400 when customer has active booking', async () => {
      // Arrange
      const activeBooking = BookingFactory.create({ customerId: mockCustomer.id, status: BookingStatus.ACCEPTED });
      prismaService.booking.findFirst = jest.fn().mockResolvedValue(activeBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send(validCreateBookingDto)
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('already have an active booking');
        });
    });

    it('should return 400 for invalid coordinates', async () => {
      // Arrange
      const invalidDto = {
        ...validCreateBookingDto,
        pickupLatitude: 91, // Invalid latitude
      };

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send(invalidDto)
        .expect(400);
    });

    it('should return 401 without authorization', async () => {
      // Act & Assert
      await request(app.getHttpServer()).post('/bookings').send(validCreateBookingDto).expect(401);
    });
  });

  describe('GET /bookings/:bookingId', () => {
    it('should get booking details successfully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations();
      prismaService.booking.findUnique = jest.fn().mockResolvedValue(mockBooking);

      // Act
      const response = await request(app.getHttpServer())
        .get(`/bookings/${mockBooking.id}`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200);

      // Assert
      expect(response.body).toMatchObject({
        id: mockBooking.id,
        customerId: mockBooking.customerId,
        status: mockBooking.status,
      });
    });

    it('should return 404 for non-existent booking', async () => {
      // Arrange
      prismaService.booking.findUnique = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await request(app.getHttpServer())
        .get('/bookings/non-existent-id')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(404);
    });
  });

  describe('PUT /bookings/:bookingId/accept', () => {
    it('should accept booking successfully', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({
        status: BookingStatus.PENDING,
        driverId: null,
      });
      const acceptedBooking = BookingFactory.createAccepted({
        id: pendingBooking.id,
        driverId: mockDriver.id,
      });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(pendingBooking);
      prismaService.booking.findFirst = jest.fn().mockResolvedValue(null); // No active booking for driver
      prismaService.booking.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaService.booking.findUnique = jest.fn().mockResolvedValue(acceptedBooking);

      redisClient.set.mockResolvedValue('OK'); // Lock acquired
      redisClient.sismember.mockResolvedValue(1); // Driver is eligible

      // Act
      const response = await request(app.getHttpServer())
        .put(`/bookings/${pendingBooking.id}/accept`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(200);

      // Assert
      expect(response.body.status).toBe(BookingStatus.ACCEPTED);
      expect(response.body.driverId).toBe(mockDriver.id);
      expect(messagingService.publish).toHaveBeenCalledTimes(2); // ACCEPTED and TAKEN events
    });

    it('should return 400 when driver has active booking', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      const activeDriverBooking = BookingFactory.createAccepted({ driverId: mockDriver.id });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(pendingBooking);
      prismaService.booking.findFirst = jest.fn().mockResolvedValue(activeDriverBooking);

      redisClient.set.mockResolvedValue('OK');

      // Act & Assert
      await request(app.getHttpServer())
        .put(`/bookings/${pendingBooking.id}/accept`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('already have an active booking');
        });
    });

    it('should return 400 when booking is no longer available', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted();

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(acceptedBooking);
      prismaService.booking.findFirst = jest.fn().mockResolvedValue(null);

      redisClient.set.mockResolvedValue('OK');

      // Act & Assert
      await request(app.getHttpServer())
        .put(`/bookings/${acceptedBooking.id}/accept`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('no longer available');
        });
    });
  });

  describe('PUT /bookings/:bookingId/cancel', () => {
    it('should cancel booking successfully by customer', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({ customerId: mockCustomer.id });
      const cancelledBooking = BookingFactory.createCancelled({
        id: acceptedBooking.id,
        customerId: mockCustomer.id,
      });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(acceptedBooking);
      prismaService.booking.update = jest.fn().mockResolvedValue(cancelledBooking);

      // Act
      const response = await request(app.getHttpServer())
        .put(`/bookings/${acceptedBooking.id}/cancel`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200);

      // Assert
      expect(response.body.status).toBe(BookingStatus.CANCELLED);
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cancelledBy: 'customer',
        }),
      );
    });

    it('should cancel booking successfully by driver', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({
        customerId: mockCustomer.id,
        driverId: mockDriver.id,
      });
      const cancelledBooking = BookingFactory.createCancelled({
        id: acceptedBooking.id,
        customerId: mockCustomer.id,
        driverId: mockDriver.id,
      });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(acceptedBooking);
      prismaService.booking.update = jest.fn().mockResolvedValue(cancelledBooking);

      // Act
      const response = await request(app.getHttpServer())
        .put(`/bookings/${acceptedBooking.id}/cancel`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(200);

      // Assert
      expect(response.body.status).toBe(BookingStatus.CANCELLED);
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cancelledBy: 'driver',
        }),
      );
    });

    it('should return 401 for unauthorized cancellation', async () => {
      // Arrange
      const acceptedBooking = BookingFactory.createAccepted({ customerId: mockCustomer.id });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(acceptedBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .put(`/bookings/${acceptedBooking.id}/cancel`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', 'unauthorized-user')
        .set('X-User-Role', 'customer')
        .expect(401);
    });

    it('should return 400 for completed booking cancellation', async () => {
      // Arrange
      const completedBooking = BookingFactory.createCompleted({ customerId: mockCustomer.id });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(completedBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .put(`/bookings/${completedBooking.id}/cancel`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('Cannot cancel booking with status');
        });
    });
  });

  describe('GET /bookings', () => {
    it('should get user bookings with pagination', async () => {
      // Arrange
      const mockBookings = [
        BookingFactory.createWithRelations({ customerId: mockCustomer.id }),
        BookingFactory.createWithRelations({ customerId: mockCustomer.id }),
      ];

      prismaService.booking.findMany = jest.fn().mockResolvedValue(mockBookings);
      prismaService.booking.count = jest.fn().mockResolvedValue(2);

      // Act
      const response = await request(app.getHttpServer())
        .get('/bookings')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200);

      // Assert
      expect(response.body).toMatchObject({
        data: expect.arrayContaining([expect.objectContaining({ customerId: mockCustomer.id })]),
        meta: {
          total: 2,
          page: 1,
          limit: 10,
          pages: 1,
        },
      });
    });

    it('should filter bookings by status', async () => {
      // Arrange
      const completedBookings = [BookingFactory.createCompleted({ customerId: mockCustomer.id })];

      prismaService.booking.findMany = jest.fn().mockResolvedValue(completedBookings);
      prismaService.booking.count = jest.fn().mockResolvedValue(1);

      // Act
      const response = await request(app.getHttpServer())
        .get('/bookings')
        .query({ status: BookingStatus.COMPLETED })
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200);

      // Assert
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe(BookingStatus.COMPLETED);
    });
  });

  describe('DELETE /bookings/:bookingId', () => {
    it('should delete cancelled booking successfully', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: mockCustomer.id });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(cancelledBooking);
      prismaService.booking.delete = jest.fn().mockResolvedValue(cancelledBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .delete(`/bookings/${cancelledBooking.id}`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200)
        .expect(res => {
          expect(res.body.message).toContain('deleted successfully');
        });
    });

    it('should return 400 for non-deletable booking status', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({
        customerId: mockCustomer.id,
        status: BookingStatus.PENDING,
      });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(pendingBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .delete(`/bookings/${pendingBooking.id}`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('Cannot delete booking with status');
        });
    });

    it('should return 401 for non-customer deletion', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: mockCustomer.id });

      prismaService.booking.findUnique = jest.fn().mockResolvedValue(cancelledBooking);

      // Act & Assert
      await request(app.getHttpServer())
        .delete(`/bookings/${cancelledBooking.id}`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(401)
        .expect(res => {
          expect(res.body.message).toContain('Only the customer can delete');
        });
    });
  });
});
