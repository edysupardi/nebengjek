import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { CommonConfigModule } from '@app/common/config/config.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from '@app/database/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoggingModule } from '@app/common/modules/logging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CommonConfigModule,
    UserModule,
    AuthModule,
    PrismaModule,
    LoggingModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}