import { HealthModule } from '@app/common';
import { LoggingModule } from '@app/common/modules/logging.module';
import { PrismaService } from '@app/database';
import { PrismaModule } from '@app/database/prisma/prisma.module';
import { RedisModule } from '@app/database/redis/redis.module';
import { MessagingModule } from '@app/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggingModule,
    MessagingModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        serviceName: 'booking-service',
      }),
      inject: [ConfigService],
    }),
    HealthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // eslint-disable-next-line no-undef
        const Redis = require('ioredis');
        return {
          redis: new Redis({
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
          }),
          prisma: new PrismaService(),
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        // eslint-disable-next-line no-undef
        const Redis = require('ioredis');
        return new Redis({
          host: configService.get('REDIS_HOST', 'redis'),
          port: configService.get('REDIS_PORT', 6379),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
