import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BookingController } from '@app/booking/booking.controller';
import { BookingService } from '@app/booking/booking.service';
import { BookingRepository } from '@app/booking/repositories/booking.repository';
import { PrismaService, RedisModule } from '@app/database';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios';
import { LoggingModule } from '@app/common/modules/logging.module';
import { HealthModule } from '@app/common';
import { MessagingModule } from '@app/messaging';

/**
 * @module BookingModule
 * @description Module responsible for handling booking-related functionality in the application
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RedisModule.forRoot(),
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
    }),
    HttpModule,
    ClientsModule.registerAsync([
      {
        name: 'NOTIFICATION_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('NOTIFICATION_SERVICE_HOST', 'notification-service'),
            port: configService.get('NOTIFICATION_TCP_PORT', 8004), // TCP port for notification
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'MATCHING_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('MATCHING_SERVICE_HOST', 'matching-service'),
            port: configService.get('MATCHING_TCP_PORT', 8006), // TCP port for matching
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingRepository,
    PrismaService,
  ],
  exports: [
    BookingService,
    BookingRepository,
  ],
})
export class BookingModule { }