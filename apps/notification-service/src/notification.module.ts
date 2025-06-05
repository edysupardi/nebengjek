// src/notification.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule, PrismaService } from '@app/database';
import { RedisModule } from '@app/database/redis/redis.module';
import { NotificationController } from '@app/notification/notification.controller';
import { NotificationService } from '@app/notification/notification.service';
import { NotificationRepository } from '@app/notification/repositories/notification.repository';
import { NotificationGateway } from '@app/notification/websocket/notification.gateway';
import { EventsController } from '@app/notification/events/events.controller';
import { HealthModule } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { LoggingModule } from '@app/common/modules/logging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    RedisModule.forRoot(),
    LoggingModule,
    // Use MessagingModule with separate Redis DB to avoid conflict
    MessagingModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'notification-service',
        // Use different Redis database for messaging to avoid conflict
        redisConfig: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          db: 1, // Use database 1 for messaging (default is 0)
        },
        // Auto-subscribe to these channels on startup
        channels: [
          'booking.created',
          'booking.updated', 
          'booking.accepted',
          'booking.rejected',
          'booking.cancelled',
          'trip.started',
          'trip.updated',
          'trip.ended',
          'payment.completed'
        ],
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
            db: 0, // Use database 0 for health checks
          }),
          prisma: new PrismaService(),
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationController, EventsController],
  providers: [
    NotificationService, 
    NotificationRepository, 
    NotificationGateway,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}