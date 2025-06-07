import { HealthModule } from '@app/common';
import { LoggingModule } from '@app/common/modules/logging.module';
import { PrismaService } from '@app/database';
import { PrismaModule } from '@app/database/prisma/prisma.module';
import { RedisModule } from '@app/database/redis/redis.module';
import { MessagingModule } from '@app/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
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
    ClientsModule.registerAsync([
      {
        name: 'USER_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('USER_SERVICE_HOST', 'user-service'),
            port: configService.get('USER_TCP_PORT', 8008),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'TRACKING_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('TRACKING_SERVICE_HOST', 'tracking-service'),
            port: configService.get('TRACKING_TCP_PORT', 8009),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'BOOKING_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('BOOKING_SERVICE_HOST', 'booking-service'),
            port: configService.get('BOOKING_TCP_PORT', 8005),
          },
        }),
        inject: [ConfigService],
      },
    ]),
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
