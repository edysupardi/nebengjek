import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ProxyModule } from './proxy/proxy.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ErrorFilter } from './common/filters/error.filter';
import { RateLimiterGuard } from './common/guards/rate-limiter.guard';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ProxyModule,     // Handles request routing to microservices
    AuthModule,      // Centralized auth validation
    HealthModule,    // Health check endpoints for AWS load balancers
    MetricsModule,   // Expose metrics for CloudWatch
    CircuitBreakerModule, // Circuit breaker implementation
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
export class AppModule {}