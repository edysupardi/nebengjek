import { Module } from '@nestjs/common';
import { LocationController } from '@app/location/location.controller';
import { LocationService } from '@app/location/location.service';
import { LocationRepository } from '@app/location/repositories/location.repository';
import { PrismaService } from '@app/database';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@app/common/strategies/jwt.strategy';
import { HealthModule } from '@app/common';

@Module({
  controllers: [LocationController],
  imports: [
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
  providers: [
    LocationService,
    LocationRepository,
    PrismaService,
    JwtStrategy,
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
  exports: [LocationService],
})
export class LocationModule {}