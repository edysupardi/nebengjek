import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { CommonConfigModule } from '@libs/common/config/config.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CommonConfigModule,
    UserModule,
    AuthModule,
    PrismaModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}