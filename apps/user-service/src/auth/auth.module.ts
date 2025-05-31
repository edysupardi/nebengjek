import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from '@app/auth/auth.service';
import { AuthController } from '@app/auth/auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '@app/user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@app/database/redis/redis.module';
import { JwtStrategy } from '@app/common/strategies/jwt.strategy';
import { JwtRefreshStrategy } from '@app/common/strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from '@app/common';

@Module({
  imports: [
    ConfigModule,
    RedisModule.forRoot(),
    forwardRef(() => UserModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN') 
        },
      }),
      inject: [ConfigService],
    }),
    // Config untuk refresh token
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_REFRESH_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_REFRESH_EXPIRES_IN') 
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
  ],
  exports: [
    JwtAuthGuard,
    AuthService,
  ]
})
export class AuthModule {}