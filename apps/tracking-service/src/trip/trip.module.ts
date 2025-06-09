import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';
import { TripRepository } from './repositories/trip.repository';
import { PrismaService, RedisModule } from '@app/database';
import { TripGateway } from './trip.gateway';
import { LocationModule } from '../location/location.module';
import { MessagingModule } from '@app/messaging';
import { LoggingModule } from '@app/common/modules/logging.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LocationModule,
    MessagingModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tracking-service',
      }),
      inject: [ConfigService],
    }),
    RedisModule.forRoot(),
    LoggingModule,
    HttpModule,
    ClientsModule.registerAsync([
      {
        name: 'PAYMENT_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('PAYMENT_SERVICE_HOST', 'payment-service'),
            port: Number(configService.get('PAYMENT_TCP_PORT', 8007)),
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
            port: Number(configService.get('BOOKING_TCP_PORT', 8005)),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [TripController],
  providers: [TripService, TripRepository, PrismaService, TripGateway],
  exports: [TripService, TripRepository],
})
export class TripModule {}
