import { UserRole } from '@app/common';
import { BookingStatus } from '@app/common/enums/booking-status.enum';

// Mock Users
export const mockCustomer = {
  id: 'customer-123',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+6281234567890',
  role: UserRole.CUSTOMER,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  password: 'hashed-password',
};

export const mockDriver = {
  id: 'driver-123',
  name: 'Driver Name',
  email: 'driver@example.com',
  phone: '+6281234567891',
  role: UserRole.DRIVER,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  password: 'hashed-password',
  driverProfile: {
    id: 'driver-profile-123',
    userId: 'driver-123',
    status: true,
    lastLatitude: -6.2088,
    lastLongitude: 106.8456,
    vehicleType: 'motorcycle',
    plateNumber: 'B1234XYZ',
    rating: 4.5,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
};

// Factory for creating booking objects
export class BookingFactory {
  static create(overrides: any = {}) {
    return {
      id: 'booking-123',
      customerId: 'customer-123',
      driverId: null,
      pickupLat: -6.2088,
      pickupLng: 106.8456,
      destinationLat: -6.1944,
      destinationLng: 106.8229,
      status: BookingStatus.PENDING,
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  static createWithRelations(overrides: any = {}) {
    const booking = this.create(overrides);
    return {
      ...booking,
      customer: mockCustomer,
      driver: booking.driverId ? mockDriver : null,
    };
  }

  static createAccepted(overrides: any = {}) {
    return this.create({
      status: BookingStatus.ACCEPTED,
      driverId: 'driver-123',
      acceptedAt: new Date('2024-01-01T01:00:00.000Z'),
      ...overrides,
    });
  }

  static createCompleted(overrides: any = {}) {
    return this.create({
      status: BookingStatus.COMPLETED,
      driverId: 'driver-123',
      acceptedAt: new Date('2024-01-01T01:00:00.000Z'),
      startedAt: new Date('2024-01-01T02:00:00.000Z'),
      completedAt: new Date('2024-01-01T03:00:00.000Z'),
      ...overrides,
    });
  }

  static createCancelled(overrides: any = {}) {
    return this.create({
      status: BookingStatus.CANCELLED,
      cancelledAt: new Date('2024-01-01T01:00:00.000Z'),
      ...overrides,
    });
  }

  static createOngoing(overrides: any = {}) {
    return this.create({
      status: BookingStatus.ONGOING,
      driverId: 'driver-123',
      acceptedAt: new Date('2024-01-01T01:00:00.000Z'),
      startedAt: new Date('2024-01-01T02:00:00.000Z'),
      ...overrides,
    });
  }
}

// Mock Redis Client
export const createMockRedisClient = () => ({
  hset: jest.fn().mockResolvedValue('OK'),
  expire: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  sismember: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  sadd: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
});

// Mock ClientProxy (for microservices)
export const createMockClientProxy = () => ({
  send: jest.fn(),
  emit: jest.fn(),
});

// Mock MessagingService
export const createMockMessagingService = () => ({
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(),
  emitLocal: jest.fn(),
  onLocal: jest.fn(),
});

// Mock HttpService
export const createMockHttpService = () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  head: jest.fn(),
  request: jest.fn(),
  axiosRef: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
});

// Standard TCP Response format
export const createTcpResponse = (success: boolean, data?: any, message?: string) => ({
  success,
  data: data || null,
  message,
});

// Mock Prisma Repository Methods
export const createMockPrismaBooking = () => ({
  create: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),
});

// Mock Process Environment
export const mockProcessEnv = {
  BOOKING_TIMEOUT_MINUTES: '3',
  BOOKING_AUTO_CANCEL_ENABLED: 'true',
  TRACKING_WS_PORT: '3060',
};

// Driver Availability Response
export const createDriverAvailabilityResponse = (driverId: string, isAvailable: boolean, activeBooking?: any) => ({
  driverId,
  isAvailable,
  activeBooking: activeBooking || null,
});

// Group By Response for Statistics
export const createGroupByResponse = (status: BookingStatus, count: number) => ({
  status,
  _count: { status: count },
});

// Mock Trip Response (for tracking service)
export const createMockTripResponse = (tripId?: string) => ({
  success: true,
  data: tripId ? { id: tripId, status: 'ONGOING' } : null,
});

export const createMockDriverProfile = (overrides: any = {}) => ({
  id: 'driver-profile-123',
  userId: 'driver-123',
  status: true,
  lastLatitude: -6.2088,
  lastLongitude: 106.8456,
  vehicleType: 'motorcycle',
  plateNumber: 'B1234XYZ',
  rating: 4.5,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});
