import { Module } from '@nestjs/common';
import { HealthController } from '@app/apigateway/health/health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { HealthService } from '@app/apigateway/health/health.service';

@Module({
  imports: [
    TerminusModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}