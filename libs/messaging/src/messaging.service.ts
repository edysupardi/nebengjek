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
  
  // Separate connections for publisher and subscriber
  private publisherClient: any;
  private subscriberClient: any;
  
  constructor(
    private eventEmitter: EventEmitter2,
    @Inject('REDIS_CLIENT') private defaultRedisService: any,
    @Optional() @Inject('MESSAGING_REDIS_CLIENT') private messagingRedisClient: any,
    @Optional() @Inject('MESSAGING_OPTIONS') private options?: any
  ) {
    // Create separate connections for publisher and subscriber
    this.initializeRedisConnections();
  }

  private initializeRedisConnections(): void {
    const redisConfig = this.getRedisConfig();
    
    // Create separate Redis clients
    const Redis = require('ioredis');
    
    if (redisConfig) {
      // Use custom Redis config if provided
      this.publisherClient = new Redis(redisConfig);
      this.subscriberClient = new Redis(redisConfig);
    } else {
      // Use default Redis config
      const defaultConfig = {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 1 // Use database 1 for messaging
      };
      this.publisherClient = new Redis(defaultConfig);
      this.subscriberClient = new Redis(defaultConfig);
    }
  }

  private getRedisConfig(): any {
    if (this.options?.redisConfig) {
      return this.options.redisConfig;
    }
    return null;
  }

  async onModuleInit() {
    this.logger.log('Initializing messaging service with separate Redis connections');
    
    // Test both connections
    try {
      await this.publisherClient.ping();
      await this.subscriberClient.ping();
      this.logger.log('Messaging Redis connections successful (publisher & subscriber)');
    } catch (error) {
      this.logger.error('Messaging Redis connection failed:', error);
    }
    
    // Auto-subscribe to configured channels
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
      try {
        await this.subscriberClient.unsubscribe(channel);
      } catch (error) {
        this.logger.error(`Error unsubscribing from ${channel}:`, error);
      }
    }
    
    // Close connections
    try {
      await this.publisherClient.quit();
      await this.subscriberClient.quit();
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error);
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
      
      // Use dedicated publisher client
      await this.publisherClient.publish(String(event), message);
      
      // Also emit locally for any local subscribers
      this.emitLocal(event, payload);
      
      this.logger.debug(`[GLOBAL] Successfully published event: ${String(event)}`);
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
      
      // Use dedicated subscriber client
      this.subscriberClient.subscribe(eventName);
      this.subscriberClient.on('message', (channel: string, message: string) => {
        if (channel === eventName) {
          this.processRedisMessage(eventName, message);
        }
      });
      
      this.logger.debug(`[GLOBAL] Successfully subscribed to event: ${eventName}`);
    }
  }

  private processRedisMessage(eventName: string, message: string): void {
    try {
      const data = JSON.parse(message);
      
      // Skip messages sent by this instance if specified in options
      if (this.options?.skipSelfMessages && data.source === this.options.serviceName) {
        this.logger.debug(`[GLOBAL] Skipping self-sent message for event: ${eventName}`);
        return;
      }
      
      this.logger.debug(`[GLOBAL] Processing message for event: ${eventName}`);
      
      // Execute all callbacks registered for this event
      const callbacks = this.channelCallbacks.get(eventName);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            cb(data.payload);
          } catch (error) {
            this.logger.error(`Error executing callback for event ${eventName}:`, error);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing event ${eventName}: ${errorMessage}`);
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
          this.subscriberClient.unsubscribe(eventName);
          this.subscribedChannels.delete(eventName);
        }
      }
    } else {
      // Remove all callbacks for this event
      this.channelCallbacks.delete(eventName);
      this.subscriberClient.unsubscribe(eventName);
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
   * Get the publisher Redis client for advanced use cases
   */
  getPublisherClient(): any {
    return this.publisherClient;
  }

  /**
   * Get the subscriber Redis client for advanced use cases
   */
  getSubscriberClient(): any {
    return this.subscriberClient;
  }

  /**
   * Get connection info for debugging
   */
  getConnectionInfo(): { publisher: string; subscriber: string } {
    return {
      publisher: `${this.publisherClient.options.host}:${this.publisherClient.options.port}/db${this.publisherClient.options.db || 0}`,
      subscriber: `${this.subscriberClient.options.host}:${this.subscriberClient.options.port}/db${this.subscriberClient.options.db || 0}`
    };
  }
}