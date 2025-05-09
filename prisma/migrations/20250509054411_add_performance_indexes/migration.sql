/*
  Warnings:

  - You are about to drop the `Transaction` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updated_at` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_tripId_fkey";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "relatedId" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "Transaction";

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "total_fare" DOUBLE PRECISION NOT NULL,
    "driver_share" DOUBLE PRECISION NOT NULL,
    "platform_fee" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final_amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_tripId_key" ON "transaction"("tripId");

-- CreateIndex
CREATE INDEX "transaction_status_idx" ON "transaction"("status");

-- CreateIndex
CREATE INDEX "transaction_created_at_idx" ON "transaction"("created_at");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "bookings_driver_id_idx" ON "bookings"("driver_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- CreateIndex
CREATE INDEX "driver_profiles_status_idx" ON "driver_profiles"("status");

-- CreateIndex
CREATE INDEX "driver_profiles_last_latitude_last_longitude_idx" ON "driver_profiles"("last_latitude", "last_longitude");

-- CreateIndex
CREATE INDEX "locations_user_id_timestamp_idx" ON "locations"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "locations_latitude_longitude_idx" ON "locations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_start_time_idx" ON "trips"("start_time");

-- CreateIndex
CREATE INDEX "trips_end_time_idx" ON "trips"("end_time");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
