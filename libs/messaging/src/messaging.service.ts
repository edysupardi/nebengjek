import { BookingEvents, EventPayloadMap } from '@app/messaging/events/event-types';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private readonly subscribedChannels: Set<string> = new Set();
  private readonly channelCallbacks: Map<string, Set<(payload: any) => void>> = new Map();

  private publisherClient: any;
  private subscriberClient: any;
  private isInitialized = false;

  private allowedSelfConsumptionEvents = [
    BookingEvents.DRIVERS_READY,
    BookingEvents.NEARBY_DRIVERS_FOUND,
    // tambahkan event lain yang perlu self-consumption
  ];

  constructor(
    private eventEmitter: EventEmitter2,
    @Inject('REDIS_CLIENT') private defaultRedisService: any,
    @Optional() @Inject('MESSAGING_REDIS_CLIENT') private messagingRedisClient: any,
    @Optional() @Inject('MESSAGING_OPTIONS') private options?: any,
  ) {
    this.initializeRedisConnections();
  }

  private initializeRedisConnections(): void {
    const redisConfig = this.getRedisConfig();
    const Redis = require('ioredis');

    if (redisConfig) {
      this.publisherClient = new Redis({
        ...redisConfig,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      this.subscriberClient = new Redis({
        ...redisConfig,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    } else {
      const defaultConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 2,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      };
      this.publisherClient = new Redis(defaultConfig);
      this.subscriberClient = new Redis(defaultConfig);
    }

    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    this.publisherClient.on('error', (error: Error) => {
      this.logger.error('Publisher Redis connection error:', error.message);
    });

    this.subscriberClient.on('error', (error: Error) => {
      this.logger.error('Subscriber Redis connection error:', error.message);
    });

    this.publisherClient.on('ready', () => {
      this.logger.log('Publisher Redis connection ready');
    });

    this.subscriberClient.on('ready', () => {
      this.logger.log('Subscriber Redis connection ready');
    });

    this.publisherClient.on('reconnecting', () => {
      this.logger.warn('Publisher Redis reconnecting...');
    });

    this.subscriberClient.on('reconnecting', () => {
      this.logger.warn('Subscriber Redis reconnecting...');
    });
  }

  private getRedisConfig(): any {
    if (this.options?.redisConfig) {
      return this.options.redisConfig;
    }
    return null;
  }

  async onModuleInit() {
    try {
      this.logger.log('Initializing messaging service with separate Redis connections');

      await Promise.all([this.publisherClient.connect(), this.subscriberClient.connect()]);

      await Promise.all([this.publisherClient.ping(), this.subscriberClient.ping()]);

      this.logger.log('Messaging Redis connections successful (publisher & subscriber)');
      this.isInitialized = true;

      if (this.options?.channels) {
        for (const channel of this.options.channels) {
          this.subscribe(channel as any, payload => {
            this.logger.debug(`Auto-subscribed channel ${channel} received message`);
            this.emitLocal(channel as any, payload);
          });
        }
        this.logger.log(`Auto-subscribed to ${this.options.channels.length} channels`);
      }
    } catch (error) {
      this.logger.error('Messaging Redis connection failed:', error);
      this.isInitialized = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Cleaning up messaging service subscriptions');

    for (const channel of this.subscribedChannels) {
      try {
        await this.subscriberClient.unsubscribe(channel);
      } catch (error) {
        this.logger.error(`Error unsubscribing from ${channel}:`, error);
      }
    }

    try {
      await Promise.all([this.publisherClient.quit(), this.subscriberClient.quit()]);
      this.logger.log('Redis connections closed successfully');
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error);
    }
  }

  emitLocal<T extends keyof EventPayloadMap>(event: T, payload: EventPayloadMap[T]): void {
    this.logger.debug(`[LOCAL] Emitting event: ${String(event)}`);
    this.eventEmitter.emit(String(event), payload);
  }

  onLocal<T extends keyof EventPayloadMap>(event: T, callback: (payload: EventPayloadMap[T]) => void): void {
    this.logger.debug(`[LOCAL] Subscribing to event: ${String(event)}`);
    this.eventEmitter.on(String(event), callback);
  }

  async publish<T extends keyof EventPayloadMap>(event: T, payload: EventPayloadMap[T]): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn(`Cannot publish event ${String(event)} - service not initialized`);
      return;
    }

    try {
      this.logger.debug(`[GLOBAL] Publishing event: ${String(event)}`);
      const message = JSON.stringify({
        event: String(event),
        payload,
        timestamp: new Date().toISOString(),
        source: this.options?.serviceName || 'unknown',
      });

      await this.publisherClient.publish(String(event), message);
      this.emitLocal(event, payload);

      this.logger.debug(`[GLOBAL] Successfully published event: ${String(event)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to publish event ${String(event)}: ${errorMessage}`);
      throw error;
    }
  }

  subscribe<T extends keyof EventPayloadMap>(event: T, callback: (payload: EventPayloadMap[T]) => void): void {
    const eventName = String(event);
    this.logger.debug(`[GLOBAL] Subscribing to event: ${eventName}`);

    if (!this.channelCallbacks.has(eventName)) {
      this.channelCallbacks.set(eventName, new Set());
    }
    this.channelCallbacks.get(eventName)!.add(callback as any);

    if (!this.subscribedChannels.has(eventName)) {
      this.subscribedChannels.add(eventName);

      if (this.isInitialized) {
        this.subscriberClient.subscribe(eventName, (error: Error) => {
          if (error) {
            this.logger.error(`Error subscribing to ${eventName}:`, error);
          } else {
            this.logger.debug(`Successfully subscribed to: ${eventName}`);
          }
        });
      }

      this.subscriberClient.on('message', (channel: string, message: string) => {
        if (channel === eventName) {
          this.processRedisMessage(eventName, message);
        }
      });
    }
  }

  private processRedisMessage(eventName: string, message: string): void {
    try {
      const data = JSON.parse(message);

      // 🔥 FIX: Check if self-consumption is allowed for this event
      const isFromSelf = this.options?.skipSelfMessages && data.source === this.options.serviceName;
      const isSelfConsumptionAllowed = this.allowedSelfConsumptionEvents.includes(eventName as any);

      if (isFromSelf && !isSelfConsumptionAllowed) {
        this.logger.debug(`[GLOBAL] Skipping self-sent message for event: ${eventName}`);
        return;
      }

      if (isFromSelf && isSelfConsumptionAllowed) {
        this.logger.debug(`[GLOBAL] Processing self-sent message for event: ${eventName} (allowed)`);
      }

      this.logger.debug(`[GLOBAL] Processing message for event: ${eventName}`);

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

  unsubscribe<T extends keyof EventPayloadMap>(event: T, callback?: (payload: EventPayloadMap[T]) => void): void {
    const eventName = String(event);
    this.logger.debug(`[GLOBAL] Unsubscribing from event: ${eventName}`);

    if (callback) {
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
      this.channelCallbacks.delete(eventName);
      this.subscriberClient.unsubscribe(eventName);
      this.subscribedChannels.delete(eventName);
    }
  }

  subscribeToMany(events: Array<keyof EventPayloadMap>, callback: (eventName: string, payload: any) => void): void {
    for (const event of events) {
      const eventName = String(event);
      this.subscribe(event, payload => {
        callback(eventName, payload);
      });
    }
  }

  getPublisherClient(): any {
    return this.publisherClient;
  }

  getSubscriberClient(): any {
    return this.subscriberClient;
  }

  getConnectionInfo(): { publisher: string; subscriber: string; initialized: boolean } {
    return {
      publisher: `${this.publisherClient.options.host}:${this.publisherClient.options.port}/db${this.publisherClient.options.db || 0}`,
      subscriber: `${this.subscriberClient.options.host}:${this.subscriberClient.options.port}/db${this.subscriberClient.options.db || 0}`,
      initialized: this.isInitialized,
    };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async healthCheck(): Promise<{ status: string; connections: any }> {
    try {
      await Promise.all([this.publisherClient.ping(), this.subscriberClient.ping()]);

      return {
        status: 'healthy',
        connections: this.getConnectionInfo(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connections: this.getConnectionInfo(),
      };
    }
  }
}
