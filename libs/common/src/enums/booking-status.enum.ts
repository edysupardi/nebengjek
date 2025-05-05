import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

// Re-export Prisma enum
export { PrismaBookingStatus as BookingStatus };

// export enum BookingStatus {
//   PENDING = 'PENDING',
//   ACCEPTED = 'ACCEPTED',
//   REJECTED = 'REJECTED',
//   ONGOING = 'ONGOING',
//   CANCELLED = 'CANCELLED',
//   COMPLETED = 'COMPLETED',
// }