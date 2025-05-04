import { Module } from '@nestjs/common';
import { DriverService } from '@app/driver/driver.service';
import { DriverController } from '@app/driver/driver.controller';
import { DriverProfileRepository } from '@app/driver/repositories/driver-profile.repository';
import { UserRepository } from '@app/user/repositories/user.repository';
import { DatabaseModule } from '@app/database';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [DatabaseModule],
  controllers: [DriverController],
  providers: [
    DriverService,
    DriverProfileRepository,
    UserRepository,
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
  exports: [DriverService],
})
export class DriverModule {}