import { Module } from '@nestjs/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { PrismaModule } from '@app/database/prisma/prisma.module';
import { RedisModule } from '@app/database/redis/redis.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggingModule } from '@app/common/modules/logging.module';
import { MessagingModule } from '@app/messaging';
import { HealthModule } from '@app/common';
import { PrismaService } from '@app/database';

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
      useFactory: (configService: ConfigService) => ({
        serviceName: 'booking-service',
      }),
      inject: [ConfigService],
    }),
    HealthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
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
    })
  ],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis');
        return new Redis({
          host: configService.get('REDIS_HOST', 'redis'),
          port: configService.get('REDIS_PORT', 6379),
        });
      },
      inject: [ConfigService],
    }
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
