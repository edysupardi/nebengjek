import { Module } from '@nestjs/common';
import { DriverService } from '@app/driver/driver.service';
import { DriverController } from '@app/driver/driver.controller';
import { DriverProfileRepository } from '@app/driver/repositories/driver-profile.repository';
import { UserRepository } from '@app/user/repositories/user.repository';
import { DatabaseModule, RedisModule } from '@app/database';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
    RedisModule.forRoot(),
  ],
  controllers: [DriverController],
  providers: [
    DriverService,
    DriverProfileRepository,
    UserRepository,
  ],
  exports: [DriverService],
})
export class DriverModule {}