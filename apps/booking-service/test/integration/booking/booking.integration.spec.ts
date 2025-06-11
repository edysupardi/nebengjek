// apps/booking-service/test/integration/booking/booking.integration.spec.ts
import { BookingModule } from '@app/booking/booking.module';
import { BookingStatus } from '@app/common/enums/booking-status.enum';
import { PrismaService } from '@app/database';
import { MessagingService } from '@app/messaging';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import {
  BookingFactory,
  createMockClientProxy,
  createMockMessagingService,
  createMockRedisClient,
  mockCustomer,
  mockDriver,
} from '../../mocks';

describe('Booking Integration Tests', () => {
  let app: INestApplication;
  let prismaService: jest.Mocked<PrismaService>;
  let redisClient: any;
  let messagingService: jest.Mocked<MessagingService>;

  const mockJwtToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjdXN0b21lci0xMjMiLCJyb2xlIjoiY3VzdG9tZXIifQ.test'; // Mock JWT token

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
      .overrideProvider('TRACKING_SERVICE')
      .useValue(createMockClientProxy())
      .overrideProvider(MessagingService)
      .useValue(createMockMessagingService())
      .compile();

    app = moduleFixture.createNestApplication();

    // Add global guards and interceptors that would be in real app
    app.useGlobalPipes();

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
      const mockBooking = BookingFactory.createWithRelations({ customerId: mockCustomer.id });
      prismaService.booking.findFirst.mockResolvedValue(null); // No active booking
      prismaService.booking.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockResolvedValue('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');

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
      const activeBooking = BookingFactory.create({
        customerId: mockCustomer.id,
        status: BookingStatus.ACCEPTED,
      });
      prismaService.booking.findFirst.mockResolvedValue(activeBooking as any);

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

      expect(prismaService.booking.create).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid coordinates', async () => {
      // Arrange
      const invalidDto = {
        ...validCreateBookingDto,
        pickupLatitude: 91, // Invalid latitude > 90
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

    it('should return 400 for missing required fields', async () => {
      // Arrange
      const incompleteDto = {
        pickupLatitude: -6.2088,
        // Missing other required fields
      };

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send(incompleteDto)
        .expect(400);
    });

    it('should return 401 without authorization', async () => {
      // Act & Assert
      await request(app.getHttpServer()).post('/bookings').send(validCreateBookingDto).expect(401);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: mockCustomer.id });
      prismaService.booking.findFirst.mockResolvedValue(null);
      prismaService.booking.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockRejectedValue(new Error('Redis connection error'));

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send(validCreateBookingDto)
        .expect(500);
    });

    it('should handle database errors', async () => {
      // Arrange
      prismaService.booking.findFirst.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send(validCreateBookingDto)
        .expect(500);
    });
  });

  describe('GET /bookings/:bookingId', () => {
    it('should get booking details successfully', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations();
      prismaService.booking.findUnique.mockResolvedValue(mockBooking as any);

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
      prismaService.booking.findUnique.mockResolvedValue(null);

      // Act & Assert
      await request(app.getHttpServer())
        .get('/bookings/non-existent-id')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(404);
    });

    it('should handle database errors', async () => {
      // Arrange
      prismaService.booking.findUnique.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await request(app.getHttpServer())
        .get('/bookings/booking-123')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(500);
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
        driver: mockDriver,
      });

      // Mock lock acquisition
      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      redisClient.sismember.mockResolvedValue(1); // Driver is eligible

      // Mock no active booking for driver
      prismaService.booking.findFirst.mockResolvedValue(null);

      // Mock booking operations
      prismaService.booking.findUnique.mockResolvedValue(pendingBooking as any);
      prismaService.booking.updateMany.mockResolvedValue({ count: 1 } as any);

      // Return accepted booking after update
      prismaService.booking.findUnique
        .mockResolvedValueOnce(pendingBooking as any) // First call in service
        .mockResolvedValueOnce(acceptedBooking as any); // Second call in repository

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

      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      prismaService.booking.findFirst.mockResolvedValue(activeDriverBooking as any);

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

      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      prismaService.booking.findFirst.mockResolvedValue(null);
      prismaService.booking.findUnique.mockResolvedValue(acceptedBooking as any);

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

    it('should return 401 for unauthorized driver', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });

      redisClient.set.mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);
      redisClient.sismember.mockResolvedValue(0); // Driver not eligible
      redisClient.smembers.mockResolvedValue(['other-driver']);

      prismaService.booking.findFirst.mockResolvedValue(null);
      prismaService.booking.findUnique.mockResolvedValue(pendingBooking as any);

      // Act & Assert
      await request(app.getHttpServer())
        .put(`/bookings/${pendingBooking.id}/accept`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(401)
        .expect(res => {
          expect(res.body.message).toContain('not eligible to accept');
        });
    });

    it('should handle lock acquisition failure', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({ status: BookingStatus.PENDING });
      redisClient.set.mockResolvedValue(null); // Lock not acquired
      redisClient.del.mockResolvedValue(1);

      // Act & Assert
      await request(app.getHttpServer())
        .put(`/bookings/${pendingBooking.id}/accept`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockDriver.id)
        .set('X-User-Role', 'driver')
        .expect(400)
        .expect(res => {
          expect(res.body.message).toContain('currently being processed by another driver');
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

      prismaService.booking.findUnique.mockResolvedValue(acceptedBooking as any);
      prismaService.booking.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

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

      prismaService.booking.findUnique.mockResolvedValue(acceptedBooking as any);
      prismaService.booking.update.mockResolvedValue(cancelledBooking as any);
      redisClient.del.mockResolvedValue(1);

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
      prismaService.booking.findUnique.mockResolvedValue(acceptedBooking as any);

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
      prismaService.booking.findUnique.mockResolvedValue(completedBooking as any);

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

      prismaService.booking.findMany.mockResolvedValue(mockBookings as any);
      prismaService.booking.count.mockResolvedValue(2);

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

      prismaService.booking.findMany.mockResolvedValue(completedBookings as any);
      prismaService.booking.count.mockResolvedValue(1);

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

    it('should handle empty results', async () => {
      // Arrange
      prismaService.booking.findMany.mockResolvedValue([]);
      prismaService.booking.count.mockResolvedValue(0);

      // Act
      const response = await request(app.getHttpServer())
        .get('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200);

      // Assert
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });
  });

  describe('DELETE /bookings/:bookingId', () => {
    it('should delete cancelled booking successfully', async () => {
      // Arrange
      const cancelledBooking = BookingFactory.createCancelled({ customerId: mockCustomer.id });

      prismaService.booking.findUnique.mockResolvedValue(cancelledBooking as any);
      prismaService.booking.delete.mockResolvedValue(cancelledBooking as any);

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

    it('should delete completed booking successfully', async () => {
      // Arrange
      const completedBooking = BookingFactory.createCompleted({ customerId: mockCustomer.id });

      prismaService.booking.findUnique.mockResolvedValue(completedBooking as any);
      prismaService.booking.delete.mockResolvedValue(completedBooking as any);

      // Act & Assert
      await request(app.getHttpServer())
        .delete(`/bookings/${completedBooking.id}`)
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .expect(200);
    });

    it('should return 400 for non-deletable booking status', async () => {
      // Arrange
      const pendingBooking = BookingFactory.create({
        customerId: mockCustomer.id,
        status: BookingStatus.PENDING,
      });

      prismaService.booking.findUnique.mockResolvedValue(pendingBooking as any);

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
      prismaService.booking.findUnique.mockResolvedValue(cancelledBooking as any);

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

  describe('Error Handling', () => {
    it('should handle malformed JSON requests', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle missing headers', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .send({
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: 106.8229,
        })
        .expect(401); // No authorization header
    });

    it('should handle database connection failures', async () => {
      // Arrange
      prismaService.booking.findFirst.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send({
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: 106.8229,
        })
        .expect(500);
    });

    it('should handle Redis connection failures', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: mockCustomer.id });
      prismaService.booking.findFirst.mockResolvedValue(null);
      prismaService.booking.create.mockResolvedValue(mockBooking as any);

      // All Redis operations fail
      redisClient.hset.mockRejectedValue(new Error('Redis connection failed'));
      redisClient.expire.mockRejectedValue(new Error('Redis connection failed'));
      redisClient.set.mockRejectedValue(new Error('Redis connection failed'));

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send({
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: 106.8229,
        })
        .expect(500);
    });

    it('should handle messaging service failures', async () => {
      // Arrange
      const mockBooking = BookingFactory.createWithRelations({ customerId: mockCustomer.id });
      prismaService.booking.findFirst.mockResolvedValue(null);
      prismaService.booking.create.mockResolvedValue(mockBooking as any);
      redisClient.hset.mockResolvedValue('OK');
      redisClient.expire.mockResolvedValue(1);
      redisClient.set.mockResolvedValue('OK');

      messagingService.publish.mockRejectedValue(new Error('Messaging service failed'));

      // Act & Assert
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${mockJwtToken}`)
        .set('X-User-Id', mockCustomer.id)
        .set('X-User-Role', 'customer')
        .send({
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: 106.8229,
        })
        .expect(500);
    });
  });

  describe('Input Validation', () => {
    it('should validate coordinate ranges', async () => {
      const invalidCoordinates = [
        { pickupLatitude: 91, pickupLongitude: 106.8456, destinationLatitude: -6.1944, destinationLongitude: 106.8229 },
        { pickupLatitude: -6.2088, pickupLongitude: 181, destinationLatitude: -6.1944, destinationLongitude: 106.8229 },
        {
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -91,
          destinationLongitude: 106.8229,
        },
        {
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: -181,
        },
      ];

      for (const invalidDto of invalidCoordinates) {
        await request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${mockJwtToken}`)
          .set('X-User-Id', mockCustomer.id)
          .set('X-User-Role', 'customer')
          .send(invalidDto)
          .expect(400);
      }
    });

    it('should validate required fields', async () => {
      const invalidRequests = [
        {}, // No fields
        { pickupLatitude: -6.2088 }, // Missing other fields
        { pickupLatitude: -6.2088, pickupLongitude: 106.8456 }, // Missing destination
        { destinationLatitude: -6.1944, destinationLongitude: 106.8229 }, // Missing pickup
      ];

      for (const invalidDto of invalidRequests) {
        await request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${mockJwtToken}`)
          .set('X-User-Id', mockCustomer.id)
          .set('X-User-Role', 'customer')
          .send(invalidDto)
          .expect(400);
      }
    });

    it('should validate data types', async () => {
      const invalidTypes = [
        {
          pickupLatitude: 'invalid',
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: 106.8229,
        },
        {
          pickupLatitude: -6.2088,
          pickupLongitude: 'invalid',
          destinationLatitude: -6.1944,
          destinationLongitude: 106.8229,
        },
        {
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: 'invalid',
          destinationLongitude: 106.8229,
        },
        {
          pickupLatitude: -6.2088,
          pickupLongitude: 106.8456,
          destinationLatitude: -6.1944,
          destinationLongitude: 'invalid',
        },
      ];

      for (const invalidDto of invalidTypes) {
        await request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${mockJwtToken}`)
          .set('X-User-Id', mockCustomer.id)
          .set('X-User-Role', 'customer')
          .send(invalidDto)
          .expect(400);
      }
    });
  });
});
