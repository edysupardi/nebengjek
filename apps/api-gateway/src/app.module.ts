import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { ProxyModule } from '@app/apigateway/proxy/proxy.module';
import { AuthModule } from '@app/auth/auth.module';
import { HealthModule } from '@app/common/health/health.module';
import { MetricsModule } from '@app/apigateway/metrics/metrics.module';
import { LoggingInterceptor } from '@app/apigateway/common/interceptors/logging.interceptor';
import { ErrorFilter } from '@app/apigateway/common/filters/error.filter';
import { RateLimiterGuard } from '@app/apigateway/common/guards/rate-limiter.guard';
import { CircuitBreakerModule } from '@app/apigateway/circuit-breaker/circuit-breaker.module';
import { DatabaseModule } from '@app/database';
import { createWinstonLoggerOptions } from '@app/apigateway/common/config/winston.config';
import { JwtModule } from '@nestjs/jwt';
import { SecurityMiddleware } from '@app/apigateway/common/middleware/security.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createWinstonLoggerOptions(configService),
    }),
    ProxyModule, // Handles request routing to microservices
    AuthModule, // Centralized auth validation
    HealthModule, // Health check endpoints for AWS load balancers
    MetricsModule, // Expose metrics for CloudWatch
    CircuitBreakerModule, // Circuit breaker implementation
    DatabaseModule, // Database connection and configuration
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ErrorFilter,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimiterGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
