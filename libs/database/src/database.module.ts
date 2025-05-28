// libs/database/src/database.module.ts
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import Redis from 'ioredis';

@Module({
  imports: [PrismaModule],
  exports: [PrismaModule],
})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        PrismaModule,
        RedisModule.forRoot(),
      ],
      exports: [PrismaModule, RedisModule],
      global: true,
    };
  }

  static forRootAsync(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        PrismaModule,
        RedisModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => {
            return new Redis({
              host: configService.get('REDIS_HOST', 'localhost'),
              port: parseInt(configService.get('REDIS_PORT', '6379')),
              password: configService.get('REDIS_PASSWORD', undefined),
            });
          },
          inject: [ConfigService],
        }),
      ],
      exports: [PrismaModule, RedisModule],
      global: true,
    };
  }
}