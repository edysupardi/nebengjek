import { Module } from '@nestjs/common';
import { TripController } from '@app/trip/trip.controller';
import { TripService } from '@app/trip/trip.service';
import { TripRepository } from '@app/trip/repositories/trip.repository';
import { TripGateway } from '@app/trip/trip.gateway';
import { LocationModule } from '@app/location/location.module';
import { PrismaService } from '@app/database';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HealthModule } from '@app/common';

@Module({
  imports: [
    LocationModule,
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
  ],
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