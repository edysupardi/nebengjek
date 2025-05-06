/*
  Warnings:

  - You are about to drop the column `discount` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `finalPrice` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `trips` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'ONGOING';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "discount",
DROP COLUMN "finalPrice",
DROP COLUMN "price",
ADD COLUMN     "base_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discount_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "driver_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "final_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "platform_fee_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "platform_fee_percentage" DOUBLE PRECISION NOT NULL DEFAULT 5;
