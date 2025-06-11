import { HealthModule } from '@app/common/health/health.module';
import { LoggingModule } from '@app/common/modules/logging.module';
import { PrismaService } from '@app/database';
import { LocationModule } from '@app/location/location.module';
import { MessagingModule } from '@app/messaging';
import { MaintenanceService } from '@app/tracking-maintenance/maintenance.service';
import { TripModule } from '@app/trip/trip.module';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LocationModule,
    TripModule,
    LoggingModule,
    HealthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis');
        return {
          redis: new Redis({
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
          }),
          prisma: new PrismaService(configService),
        };
      },
      inject: [ConfigService],
    }),
    MessagingModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tracking-service', // Provide required config
        // Add any other options needed
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MaintenanceService],
})
export class TrackingModule {}
