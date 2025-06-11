import { AuthModule } from '@app/auth/auth.module';
import { HealthModule } from '@app/common/health/health.module';
import { PrismaService } from '@app/database';
import { UserRepository } from '@app/user/repositories/user.repository';
import { UserController } from '@app/user/user.controller';
import { UserService } from '@app/user/user.service';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    forwardRef(() => AuthModule),
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
  ],
  providers: [UserService, UserRepository],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
