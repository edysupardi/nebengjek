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
          // Global event emitter configuration
          wildcard: true,
          delimiter: '.',
          newListener: false,
          removeListener: false,
          maxListeners: 10,
          verboseMemoryLeak: true,
        }),
        RedisModule,
      ],
      providers: [MessagingService],
      exports: [MessagingService],
      global: true, // Make the module globally available
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
        RedisModule,
        ...(options.imports || []),
      ],
      providers,
      exports: [MessagingService],
      global: true,
    };
  }
}