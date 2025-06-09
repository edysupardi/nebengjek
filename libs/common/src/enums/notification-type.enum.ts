export enum CustomerNotificationType {
  BOOKING_CREATED = 'booking_created',
  DRIVER_FOUND = 'driver_found',
  DRIVER_ACCEPTED = 'driver_accepted',
  DRIVER_REJECTED = 'driver_rejected',
  BOOKING_CANCELLED = 'booking_cancelled',
  TRIP_STARTED = 'trip_started',
  TRIP_ENDED = 'trip_ended',
  PAYMENT_COMPLETED = 'payment_completed',
}

export enum DriverNotificationType {
  BOOKING_REQUEST = 'booking_request',
  BOOKING_ACCEPTED = 'booking_accepted',
  BOOKING_CANCELLED = 'booking_cancelled',
  TRIP_STARTED = 'trip_started',
  TRIP_ENDED = 'trip_ended',
  PAYMENT_COMPLETED = 'payment_completed',
}
