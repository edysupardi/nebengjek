import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';
import { TripRepository } from './repositories/trip.repository';
import { PrismaService } from '@app/database';
import { TripGateway } from './trip.gateway';
import { LocationModule } from '../location/location.module';
import { MessagingModule } from '@app/messaging';

@Module({
  imports: [
    ConfigModule,
    LocationModule,
    MessagingModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tracking-service',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [TripController],
  providers: [
    TripService,
    TripRepository,
    PrismaService,
    TripGateway,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis');
        return new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [TripService, TripRepository],
})
export class TripModule {}