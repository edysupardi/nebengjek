import { HealthModule } from '@app/common';
import { LoggingModule } from '@app/common/modules/logging.module';
import { JwtStrategy } from '@app/common/strategies/jwt.strategy';
import { PrismaService, RedisModule } from '@app/database';
import { LocationController } from '@app/location/location.controller';
import { LocationService } from '@app/location/location.service';
import { LocationRepository } from '@app/location/repositories/location.repository';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  controllers: [LocationController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
          prisma: new PrismaService(configService),
        };
      },
      inject: [ConfigService],
    }),
    RedisModule.forRoot(),
    LoggingModule,
  ],
  providers: [LocationService, LocationRepository, PrismaService, JwtStrategy],
  exports: [LocationService],
})
export class LocationModule {}
