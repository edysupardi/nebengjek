// libs/messaging/src/constants/event-types.ts

/**
 * Enum of all booking related events
 */
export enum BookingEvents {
  CREATED = 'booking.created',
  UPDATED = 'booking.updated',
  ACCEPTED = 'booking.accepted',
  REJECTED = 'booking.rejected',
  CANCELLED = 'booking.cancelled',
  COMPLETED = 'booking.completed',
}

/**
 * Enum of all trip related events
 */
export enum TripEvents {
  STARTED = 'trip.started',
  UPDATED = 'trip.updated',
  LOCATION_UPDATED = 'trip.location_updated',
  ENDED = 'trip.ended',
}

/**
 * Enum of all payment related events
 */
export enum PaymentEvents {
  CALCULATED = 'payment.calculated',
  COMPLETED = 'payment.completed',
  FAILED = 'payment.failed',
}

/**
 * Enum of all driver related events
 */
export enum DriverEvents {
  STATUS_CHANGED = 'driver.status_changed',
  LOCATION_UPDATED = 'driver.location_updated',
}

/**
 * Enum of all notification related events
 */
export enum NotificationEvents {
  SENT = 'notification.sent',
  READ = 'notification.read',
}

/**
 * Map of event names to their data payload types
 * This provides type safety when publishing and subscribing to events
 */
export interface EventPayloadMap {
  // Booking events
  [BookingEvents.CREATED]: {
    bookingId: string;
    customerId: string;
    latitude: number;
    longitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
    customerName?: string;
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

  [BookingEvents.ACCEPTED]: {
    bookingId: string;
    customerId: string;
    driverId: string;
    driverName?: string;
    driverLatitude?: number;
    driverLongitude?: number;
    estimatedArrivalTime?: number;
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

  // Trip events
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

  // Payment events
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

  // Driver events
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

  // Notification events
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
}

/**
 * Type-safe event publishing helper type
 */
export type PublishEvent<T extends keyof EventPayloadMap> = (
  event: T,
  payload: EventPayloadMap[T]
) => Promise<void>;

/**
 * Type-safe event subscription helper type
 */
export type SubscribeToEvent<T extends keyof EventPayloadMap> = (
  event: T,
  callback: (payload: EventPayloadMap[T]) => void
) => void;