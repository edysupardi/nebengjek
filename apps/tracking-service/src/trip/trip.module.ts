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
    RedisModule.forRoot(),
    LoggingModule,
  ],
  controllers: [TripController],
  providers: [
    TripService,
    TripRepository,
    PrismaService,
    TripGateway,
  ],
  exports: [TripService, TripRepository],
})
export class TripModule {}