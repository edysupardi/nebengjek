// export enum TripStatus {
//   ONGOING = 'ONGOING',
//   COMPLETED = 'COMPLETED',
//   CANCELLED = 'CANCELLED'
// }

import { TripStatus as PrismaTripStatus } from '@prisma/client';

// Re-export Prisma enum
export { PrismaTripStatus as TripStatus };