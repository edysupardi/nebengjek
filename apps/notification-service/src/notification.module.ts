import { HealthModule } from '@app/common';
import { LoggingModule } from '@app/common/modules/logging.module';
import { DatabaseModule, PrismaService } from '@app/database';
import { RedisModule } from '@app/database/redis/redis.module';
import { EventUtils, MessagingModule } from '@app/messaging';
import { BookingEventHandler } from '@app/notification/event-handlers/booking-event.handler';
import { DriverSearchHandler } from '@app/notification/event-handlers/driver-search.handler';
import { EventsController } from '@app/notification/events/events.controller';
import { NotificationController } from '@app/notification/notification.controller';
import { NotificationService } from '@app/notification/notification.service';
import { NotificationRepository } from '@app/notification/repositories/notification.repository';
import { NotificationGateway } from '@app/notification/websocket/notification.gateway';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    RedisModule.forRoot(),
    LoggingModule,
    MessagingModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'notification-service',
        redisConfig: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          db: 2,
        },
        channels: EventUtils.getNotificationServiceChannels(),
        skipSelfMessages: true,
      }),
      inject: [ConfigService],
    }),
    ClientsModule.registerAsync([
      {
        name: 'MATCHING_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('MATCHING_SERVICE_HOST', 'matching-service'),
            port: configService.get('MATCHING_TCP_PORT', 8006),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'USER_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('USER_SERVICE_HOST', 'user-service'),
            port: configService.get('USER_TCP_PORT', 8006),
          },
        }),
        inject: [ConfigService],
      },
    ]),
    HealthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis');
        return {
          redis: new Redis({
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
            db: 0,
          }),
          prisma: new PrismaService(configService),
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
    BookingEventHandler,
    DriverSearchHandler,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
