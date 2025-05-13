// libs/database/src/redis/redis.module.ts
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

@Module({})
export class RedisModule {
  static forRoot(): DynamicModule {
    const redisProvider: Provider = {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const redisConfig = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
        };
        return new Redis(redisConfig);
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider, RedisService],
      exports: [redisProvider, RedisService],
      global: true,
    };
  }

  static forRootAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => any;
    inject?: any[];
  }): DynamicModule {
    const redisProvider: Provider = {
      provide: 'REDIS_CLIENT',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: RedisModule,
      imports: [...(options.imports || [])],
      providers: [redisProvider, RedisService],
      exports: [redisProvider, RedisService],
      global: true,
    };
  }

  static register(options: {
    connectionOptions: Redis.RedisOptions;
  }): DynamicModule {
    const redisProvider: Provider = {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis(options.connectionOptions);
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider, RedisService],
      exports: [redisProvider, RedisService],
    };
  }

  static registerAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => Redis.RedisOptions;
    inject?: any[];
  }): DynamicModule {
    const redisProvider: Provider = {
      provide: 'REDIS_CLIENT',
      useFactory: async (...args: any[]) => {
        const redisOptions = await options.useFactory(...args);
        return new Redis(redisOptions);
      },
      inject: options.inject || [],
    };

    return {
      module: RedisModule,
      imports: [...(options.imports || [])],
      providers: [redisProvider, RedisService],
      exports: [redisProvider, RedisService],
    };
  }
}