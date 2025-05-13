// libs/messaging/src/messaging.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '@app/database/redis/redis.service';
import { EventPayloadMap } from '@app/messaging/events/event-types';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private readonly subscribedChannels: Set<string> = new Set();
  private readonly channelCallbacks: Map<string, Set<(payload: any) => void>> = new Map();
  
  constructor(
    private eventEmitter: EventEmitter2,
    private redisService: RedisService,
    @Optional() @Inject('MESSAGING_OPTIONS') private options?: any
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing messaging service');
    
    // Any initialization from options could go here
    if (this.options?.channels) {
      for (const channel of this.options.channels) {
        this.subscribe(channel, (payload) => {
          this.logger.debug(`Auto-subscribed channel ${channel} received message`);
          this.emitLocal(channel, payload);
        });
      }
    }
  }

  async onModuleDestroy() {
    this.logger.log('Cleaning up messaging service subscriptions');
    // Unsubscribe from all channels
    for (const channel of this.subscribedChannels) {
      this.redisService.unsubscribe(channel);
    }
  }

  /**
   * Emit a local event (in-memory, current service only)
   * @param event Event name
   * @param payload Event payload
   */
  emitLocal<T extends keyof EventPayloadMap>(event: T, payload: EventPayloadMap[T]): void {
    this.logger.debug(`[LOCAL] Emitting event: ${event}`);
    this.eventEmitter.emit(event, payload);
  }

  /**
   * Listen for local events
   * @param event Event name
   * @param callback Callback to execute when event is received
   */
  onLocal<T extends keyof EventPayloadMap>(event: T, callback: (payload: EventPayloadMap[T]) => void): void {
    this.logger.debug(`[LOCAL] Subscribing to event: ${event}`);
    this.eventEmitter.on(event, callback);
  }

  /**
   * Publish an event globally across all services
   * @param event Event name
   * @param payload Event payload
   */
  async publish<T extends keyof EventPayloadMap>(event: T, payload: EventPayloadMap[T]): Promise<void> {
    try {
      this.logger.debug(`[GLOBAL] Publishing event: ${String(event)}`);
      const message = JSON.stringify({
        event,
        payload,
        timestamp: new Date().toISOString(),
        source: this.options?.serviceName || 'unknown',
      });
      await this.redisService.publish(String(event), message);
      
      // Also emit locally for any local subscribers
      this.emitLocal(event, payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to publish event ${String(event)}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Subscribe to global events
   * @param event Event name
   * @param callback Callback to execute when event is received
   */
  subscribe<T extends keyof EventPayloadMap>(event: T, callback: (payload: EventPayloadMap[T]) => void): void {
    const eventName = String(event);
    this.logger.debug(`[GLOBAL] Subscribing to event: ${eventName}`);
    
    // Add to set of callbacks for this channel
    if (!this.channelCallbacks.has(eventName)) {
      this.channelCallbacks.set(eventName, new Set());
    }
    this.channelCallbacks.get(eventName)!.add(callback as any);
    
    // Only subscribe to Redis channel once per event type
    if (!this.subscribedChannels.has(eventName)) {
      this.subscribedChannels.add(eventName);
      
      this.redisService.subscribe(eventName, (message) => {
        try {
          const data = JSON.parse(message);
          
          // Skip messages sent by this instance if specified in options
          if (this.options?.skipSelfMessages && data.source === this.options.serviceName) {
            return;
          }
          
          // Execute all callbacks registered for this event
          const callbacks = this.channelCallbacks.get(eventName);
          if (callbacks) {
            for (const cb of callbacks) {
              cb(data.payload);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Error processing event ${eventName}: ${errorMessage}`);
        }
      });
    }
  }

  /**
   * Unsubscribe from a global event
   * @param event Event name
   * @param callback Optional specific callback to remove. If not provided, unsubscribe from all callbacks for this event.
   */
  unsubscribe<T extends keyof EventPayloadMap>(event: T, callback?: (payload: EventPayloadMap[T]) => void): void {
    const eventName = String(event);
    this.logger.debug(`[GLOBAL] Unsubscribing from event: ${eventName}`);
    
    if (callback) {
      // Remove specific callback
      const callbacks = this.channelCallbacks.get(eventName);
      if (callbacks) {
        callbacks.delete(callback as any);
        if (callbacks.size === 0) {
          this.channelCallbacks.delete(eventName);
          this.redisService.unsubscribe(eventName);
          this.subscribedChannels.delete(eventName);
        }
      }
    } else {
      // Remove all callbacks for this event
      this.channelCallbacks.delete(eventName);
      this.redisService.unsubscribe(eventName);
      this.subscribedChannels.delete(eventName);
    }
  }

  /**
   * Subscribe to multiple events with the same callback
   * @param events Array of event names
   * @param callback Callback to execute when any of the events are received
   */
  subscribeToMany(events: Array<keyof EventPayloadMap>, callback: (eventName: string, payload: any) => void): void {
    for (const event of events) {
      const eventName = String(event);
      this.subscribe(event, (payload) => {
        callback(eventName, payload);
      });
    }
  }

  /**
   * Get the Redis service for advanced use cases
   */
  getRedisService(): RedisService {
    return this.redisService;
  }
}