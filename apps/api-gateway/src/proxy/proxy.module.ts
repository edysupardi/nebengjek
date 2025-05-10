import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { HttpModule } from '@nestjs/axios';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000, // 5 seconds timeout
      maxRedirects: 5,
    }),
    CircuitBreakerModule,
  ],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}