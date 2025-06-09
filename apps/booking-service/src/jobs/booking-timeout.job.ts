import { BookingService } from '@app/booking/booking.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class BookingTimeoutJob {
  private readonly logger = new Logger(BookingTimeoutJob.name);

  constructor(
    private readonly bookingService: BookingService,
    @Inject('REDIS_CLIENT') private redis: any,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleBookingTimeouts() {
    const isAutoCancelEnabled = process.env.BOOKING_AUTO_CANCEL_ENABLED === 'true';
    if (!isAutoCancelEnabled) {
      return;
    }

    try {
      // Scan for expired booking timeouts
      const keys = await this.redis.keys('booking:*:timeout');

      for (const key of keys) {
        const bookingId = key.split(':')[1];
        const ttl = await this.redis.ttl(key);

        // If TTL is -2, key doesn't exist (expired)
        // If TTL is -1, key exists but no expiry
        // If TTL > 0, key still valid
        if (ttl === -2) {
          this.logger.log(`🕐 Timeout detected for booking ${bookingId}`);

          try {
            await this.bookingService.smartCancelBooking(bookingId, 'timeout');
            await this.redis.del(key); // Cleanup
          } catch (error) {
            this.logger.error(`Error handling timeout for booking ${bookingId}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error in booking timeout job:', error);
    }
  }
}
