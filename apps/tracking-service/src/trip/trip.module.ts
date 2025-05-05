import { Module } from '@nestjs/common';
import { TripController } from '@app/trip/trip.controller';
import { TripService } from '@app/trip/trip.service';
import { TripRepository } from '@app/trip/repositories/trip.repository';
import { TripGateway } from '@app/trip/trip.gateway';
import { LocationModule } from '@app/location/location.module';
import { PrismaService } from '@app/database';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [LocationModule],
  controllers: [TripController],
  providers: [
    TripService,
    TripRepository,
    TripGateway,
    PrismaService,
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
  exports: [TripService, TripGateway],
})
export class TripModule {}