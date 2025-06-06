import { BookingStatus, TripStatus } from '../enums';

export const STATUS_CONSTANTS = {
  DEFAULT_BOOKING_STATUS: BookingStatus.PENDING,
  DEFAULT_TRIP_STATUS: TripStatus.ONGOING,
  SEARCH_RADIUS: 1, // radius pencarian driver dalam km
};
