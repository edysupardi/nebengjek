import { Module } from '@nestjs/common';
import { UserModule } from '@app/user/user.module';
import { CommonConfigModule } from '@app/common/config/config.module';
import { PrismaModule } from '@app/database/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoggingModule } from '@app/common/modules/logging.module';
import { DriverModule } from '@app/driver/driver.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CommonConfigModule,
    UserModule,
    PrismaModule,
    LoggingModule,
    DriverModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
