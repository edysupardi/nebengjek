// Enhanced event-types.ts dengan additional booking data
export enum BookingEvents {
  CREATED = 'booking.created',
  UPDATED = 'booking.updated',
  ACCEPTED = 'booking.accepted',
  REJECTED = 'booking.rejected',
  CANCELLED = 'booking.cancelled',
  COMPLETED = 'booking.completed',
  TAKEN = 'booking.taken', // When booking is taken by another driver
  DRIVER_SEARCH_REQUESTED = 'booking.driver_search_requested',
  NEARBY_DRIVERS_FOUND = 'booking.nearby_drivers_found',
  DRIVERS_READY = 'booking.drivers_ready',
  SMART_CANCEL_REQUESTED = 'booking.smart_cancel_requested',
}

export enum TripEvents {
  STARTED = 'trip.started',
  UPDATED = 'trip.updated',
  LOCATION_UPDATED = 'trip.location_updated',
  ENDED = 'trip.ended',
  EARNINGS_UPDATED = 'trip.earnings_updated', // When trip earnings are updated
  COST_CALCULATED = 'trip.cost_calculated', // When trip cost is calculated
  REAL_TIME_UPDATE = 'trip.real_time_update', // For real-time updates during the trip
}

export enum PaymentEvents {
  CALCULATED = 'payment.calculated',
  COMPLETED = 'payment.completed',
  FAILED = 'payment.failed',
}

export enum DriverEvents {
  STATUS_CHANGED = 'driver.status_changed',
  LOCATION_UPDATED = 'driver.location_updated',
  ONLINE = 'driver.online',
  OFFLINE = 'driver.offline',
}

export enum NotificationEvents {
  SENT = 'notification.sent',
  READ = 'notification.read',
  DELIVERED = 'notification.delivered',
}

export enum CustomerEvents {
  REGISTERED = 'customer.registered',
  PROFILE_UPDATED = 'customer.profile_updated',
  LOCATION_UPDATED = 'customer.location_updated',
}

export interface EventPayloadMap {
  [BookingEvents.DRIVER_SEARCH_REQUESTED]: {
    bookingId: string;
    customerId: string;
    latitude: number;
    longitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
    customerName?: string;
    radius?: number;
  };

  // Nearby drivers found
  [BookingEvents.NEARBY_DRIVERS_FOUND]: {
    bookingId: string;
    customerId: string;
    nearbyDrivers: Array<{
      userId: string;
      latitude: number;
      longitude: number;
      distance: number;
    }>;
    searchRadius: number;
    foundAt: string;
  };

  // Drivers ready for booking
  [BookingEvents.DRIVERS_READY]: {
    bookingId: string;
    customerId: string;
    customerName?: string;
    latitude: number;
    longitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
    eligibleDriverIds: string[];
    nearbyDrivers: Array<{
      userId: string;
      latitude: number;
      longitude: number;
      distance: number;
    }>;
    createdAt: string;
    expiresAt: string;
  };

  // **ENHANCED: booking.created with additional UI data**
  [BookingEvents.CREATED]: {
    bookingId: string;
    customerId: string;
    latitude: number;
    longitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
    customerName?: string;
    // Additional properties for UI support**
    pickupLocation?: {
      latitude: number;
      longitude: number;
    };
    destinationLocation?: {
      latitude: number;
      longitude: number;
    };
    createdAt?: string;
    expiresAt?: string; // For countdown timer
    estimatedDistance?: number;
  };

  [BookingEvents.UPDATED]: {
    bookingId: string;
    customerId: string;
    driverId?: string;
    status: string;
    driverName?: string;
    driverLatitude?: number;
    driverLongitude?: number;
    estimatedArrivalTime?: number;
  };

  // **ENHANCED: booking.accepted with additional customer notification data**
  [BookingEvents.ACCEPTED]: {
    bookingId: string;
    customerId: string;
    driverId: string;
    driverName?: string;
    driverLatitude?: number;
    driverLongitude?: number;
    estimatedArrivalTime?: number;
    // Additional driver details for customer**
    driverPhone?: string;
    vehicleInfo?: {
      type?: string; // e.g., motorcycle, car, etc.
    };
  };

  [BookingEvents.REJECTED]: {
    bookingId: string;
    driverId: string;
    customerId: string;
  };

  [BookingEvents.CANCELLED]: {
    bookingId: string;
    customerId: string;
    driverId?: string;
    cancelledBy: 'driver' | 'customer' | 'system';
  };

  [BookingEvents.COMPLETED]: {
    bookingId: string;
    customerId: string;
    tripDetails: {
      completedAt?: Date;
      status?: string;
      distance?: number;
      finalPrice?: number;
      driverAmount?: number;
      platformFee?: number;
    };
  };

  // booking.taken event**
  [BookingEvents.TAKEN]: {
    bookingId: string;
    driverId: string;
    customerId: string;
    message?: string;
    timestamp?: string;
  };

  [BookingEvents.SMART_CANCEL_REQUESTED]: {
    bookingId: string;
    customerId: string;
    reason: 'no_drivers_found' | 'all_drivers_rejected' | 'timeout' | 'system';
  };

  // ... rest of the events remain unchanged ...
  [TripEvents.STARTED]: {
    tripId: string;
    bookingId: string;
    driverId: string;
    customerId: string;
    pickupLocation: {
      latitude: number;
      longitude: number;
    };
  };

  [TripEvents.UPDATED]: {
    tripId: string;
    bookingId: string;
    driverId: string;
    customerId: string;
    driverLatitude?: number;
    driverLongitude?: number;
    estimatedArrivalTime?: number;
    distanceToDestination?: number;
    statusMessage?: string;
    updatedETA?: number;
  };

  [TripEvents.LOCATION_UPDATED]: {
    tripId: string;
    driverId: string;
    latitude: number;
    longitude: number;
  };

  [TripEvents.ENDED]: {
    tripId: string;
    bookingId: string;
    driverId: string;
    customerId: string;
    fare: number;
    actualDistance: number;
    billableKm: number;
  };

  [TripEvents.EARNINGS_UPDATED]: {
    tripId: string;
    bookingId: string;
    basePrice: number;
    finalPrice: number;
    platformFeePercentage: number;
    platformFeeAmount: number;
    driverAmount: number;
    distance: number;
    timestamp: string;
  };

  [TripEvents.COST_CALCULATED]: {
    tripId: string;
    bookingId: string;
    basePrice: number;
    finalPrice: number;
    driverAmount: number;
    platformFeeAmount: number;
    distance: number;
    calculation: string;
    timestamp: string;
  };

  [TripEvents.REAL_TIME_UPDATE]: {
    tripId: string;
    driverId: string;
    customerId: string;
    latitude: number;
    longitude: number;
    timestamp: string;
    distanceToDestination: number;
    isAutoUpdate: boolean;
  };

  [PaymentEvents.CALCULATED]: {
    tripId: string;
    bookingId: string;
    distance: number;
    amount: number;
    platformFee: number;
    driverAmount: number;
  };

  [PaymentEvents.COMPLETED]: {
    tripId: string;
    bookingId: string;
    customerId: string;
    driverId: string;
    amount: number;
    driverAmount: number;
    platformFee: number;
  };

  [PaymentEvents.FAILED]: {
    tripId: string;
    bookingId: string;
    customerId: string;
    driverId: string;
    reason: string;
  };

  [DriverEvents.STATUS_CHANGED]: {
    driverId: string;
    status: boolean;
    timestamp: number;
  };

  [DriverEvents.LOCATION_UPDATED]: {
    driverId: string;
    latitude: number;
    longitude: number;
    timestamp: number;
  };

  [DriverEvents.ONLINE]: {
    driverId: string;
    timestamp: number;
    location?: {
      latitude: number;
      longitude: number;
    };
  };

  [DriverEvents.OFFLINE]: {
    driverId: string;
    timestamp: number;
    reason?: string;
  };

  [NotificationEvents.SENT]: {
    userId: string;
    type: string;
    content: string;
    relatedId?: string;
  };

  [NotificationEvents.READ]: {
    notificationId: string;
    userId: string;
  };

  [NotificationEvents.DELIVERED]: {
    notificationId: string;
    userId: string;
    channel: 'websocket' | 'push' | 'sms' | 'email';
  };

  [CustomerEvents.REGISTERED]: {
    customerId: string;
    email: string;
    phone: string;
    name: string;
    timestamp: number;
  };

  [CustomerEvents.PROFILE_UPDATED]: {
    customerId: string;
    updatedFields: string[];
    timestamp: number;
  };

  [CustomerEvents.LOCATION_UPDATED]: {
    customerId: string;
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

// Type helpers for driver notification data**
export interface DriverNotificationData {
  bookingId: string;
  customerId: string;
  customerName: string;
  pickupLocation: {
    latitude: number;
    longitude: number;
  };
  destinationLocation: {
    latitude: number;
    longitude: number;
  };
  distanceToPickup: number;
  tripDistance: number;
  driverLocation: {
    latitude: number;
    longitude: number;
  };
  estimatedEarnings: number;
  createdAt: string;
  expiresAt: string;
  actions: string[];
  message: string;
  pickupAddress: string;
  destinationAddress: string;
}

// Type helpers for customer notification data**
export interface CustomerNotificationData {
  bookingId: string;
  driverId: string;
  driverName: string;
  driverLatitude?: number;
  driverLongitude?: number;
  estimatedArrivalTime?: number;
  actions: string[];
  message: string;
  driverPhone?: string;
  vehicleInfo?: {
    plateNumber?: string;
    model?: string;
    color?: string;
  };
}

export type PublishEvent<T extends keyof EventPayloadMap> = (event: T, payload: EventPayloadMap[T]) => Promise<void>;

export type SubscribeToEvent<T extends keyof EventPayloadMap> = (
  event: T,
  callback: (payload: EventPayloadMap[T]) => void,
) => void;
