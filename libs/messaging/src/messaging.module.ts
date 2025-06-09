// libs/messaging/src/messaging.module.ts
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from '@app/database/redis/redis.module';
import { MessagingService } from '@app/messaging/messaging.service';

@Module({})
export class MessagingModule {
  static forRoot(): DynamicModule {
    return {
      module: MessagingModule,
      imports: [
        EventEmitterModule.forRoot({
          wildcard: true,
          delimiter: '.',
          newListener: false,
          removeListener: false,
          maxListeners: 10,
          verboseMemoryLeak: true,
        }),
        RedisModule.forRoot(),
      ],
      providers: [
        {
          provide: 'MESSAGING_OPTIONS',
          useValue: {
            serviceName: 'default',
          },
        },
        MessagingService,
      ],
      exports: [MessagingService],
      global: true,
    };
  }

  static forRootAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => any;
    inject?: any[];
  }): DynamicModule {
    const providers: Provider[] = [
      {
        provide: 'MESSAGING_OPTIONS',
        useFactory: options.useFactory,
        inject: options.inject || [],
      },
      // Provide separate Redis client for messaging if redisConfig is specified
      {
        provide: 'MESSAGING_REDIS_CLIENT',
        useFactory: (...args: any[]) => {
          const config = options.useFactory(...args);
          if (config.redisConfig) {
            const Redis = require('ioredis');
            return new Redis(config.redisConfig);
          }
          return null; // Use default Redis if no custom config
        },
        inject: options.inject || [],
      },
      MessagingService,
    ];

    return {
      module: MessagingModule,
      imports: [
        EventEmitterModule.forRoot({
          wildcard: true,
          delimiter: '.',
          maxListeners: 10,
        }),
        RedisModule.forRoot(),
        ...(options.imports || []),
      ],
      providers,
      exports: [MessagingService],
      global: true,
    };
  }
}
