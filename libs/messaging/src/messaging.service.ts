// libs/messaging/src/messaging.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '@app/database/redis/redis.service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private redisService: RedisService,
  ) {}

  // Local event (in-memory, current service only)
  emitLocal(event: string, payload: any): void {
    this.logger.debug(`[LOCAL] Emitting event: ${event}`);
    this.eventEmitter.emit(event, payload);
  }

  // Global event (Redis pub/sub, across all services)
  async publish(event: string, payload: any): Promise<void> {
    try {
      this.logger.debug(`[GLOBAL] Publishing event: ${event}`);
      const message = JSON.stringify({
        event,
        payload,
        timestamp: new Date().toISOString(),
      });
      await this.redisService.publish(event, message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to publish event ${event}: ${errorMessage}`);
    }
  }

  // Subscribe to global events
  subscribe(event: string, callback: (payload: any) => void): void {
    this.logger.debug(`[GLOBAL] Subscribing to event: ${event}`);
    this.redisService.subscribe(event, (message) => {
      try {
        const data = JSON.parse(message);
        callback(data.payload);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error processing event ${event}: ${errorMessage}`);
      }
    });
  }

  // Unsubscribe from global events
  unsubscribe(event: string): void {
    this.logger.debug(`[GLOBAL] Unsubscribing from event: ${event}`);
    this.redisService.unsubscribe(event);
  }
}