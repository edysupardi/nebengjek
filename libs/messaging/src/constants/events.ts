export enum Events {
  // Booking events
  BOOKING_CREATED = 'booking.created',
  BOOKING_UPDATED = 'booking.updated',
  BOOKING_CANCELLED = 'booking.cancelled',
  
  // Driver events
  DRIVER_MATCHED = 'driver.matched',
  DRIVER_LOCATION_UPDATED = 'driver.location.updated',
  
  // Payment events
  PAYMENT_INITIATED = 'payment.initiated',
  PAYMENT_COMPLETED = 'payment.completed',
  
  // Notification events
  NOTIFICATION_SENT = 'notification.sent',
}