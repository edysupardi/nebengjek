// libs/messaging/src/utils/event-utils.ts
import {
  BookingEvents,
  CustomerEvents,
  DriverEvents,
  NotificationEvents,
  PaymentEvents,
  TripEvents,
} from '../events/event-types';

export class EventUtils {
  static getAllBookingEvents(): string[] {
    return Object.values(BookingEvents);
  }

  static getAllTripEvents(): string[] {
    return Object.values(TripEvents);
  }

  static getAllPaymentEvents(): string[] {
    return Object.values(PaymentEvents);
  }

  static getAllDriverEvents(): string[] {
    return Object.values(DriverEvents);
  }

  static getAllNotificationEvents(): string[] {
    return Object.values(NotificationEvents);
  }

  static getAllCustomerEvents(): string[] {
    return Object.values(CustomerEvents);
  }

  static getNotificationServiceChannels(): string[] {
    return [...this.getAllBookingEvents(), ...this.getAllTripEvents(), ...this.getAllPaymentEvents()];
  }

  static getDriverServiceChannels(): string[] {
    return [...this.getAllBookingEvents(), ...this.getAllTripEvents(), ...this.getAllDriverEvents()];
  }

  static getCustomerServiceChannels(): string[] {
    return [
      ...this.getAllBookingEvents(),
      ...this.getAllTripEvents(),
      ...this.getAllPaymentEvents(),
      ...this.getAllCustomerEvents(),
    ];
  }

  static getAllSystemEvents(): string[] {
    return [
      ...this.getAllBookingEvents(),
      ...this.getAllTripEvents(),
      ...this.getAllPaymentEvents(),
      ...this.getAllDriverEvents(),
      ...this.getAllNotificationEvents(),
      ...this.getAllCustomerEvents(),
    ];
  }
}
