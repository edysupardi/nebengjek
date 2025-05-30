import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BookingController } from '@app/booking/booking.controller';
import { BookingService } from '@app/booking/booking.service';
import { BookingRepository } from '@app/booking/repositories/booking.repository';
import { PrismaService } from '@app/database';
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
        name: 'TRACKING_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('TRACKING_SERVICE_HOST', 'localhost'),
            port: configService.get('TRACKING_PORT', 3003),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'NOTIFICATION_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('NOTIFICATION_SERVICE_HOST', 'localhost'),
            port: configService.get('NOTIFICATION_PORT', 3004),
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
            host: configService.get('MATCHING_SERVICE_HOST', 'localhost'),
            port: configService.get('MATCHING_PORT', 3004),
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
})
export class BookingModule {}