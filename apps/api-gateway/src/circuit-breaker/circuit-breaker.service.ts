import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const CircuitBreaker = require('opossum');

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, any>();

  constructor(private configService: ConfigService) {}

  getBreaker(serviceKey: string) {
    if (!this.breakers.has(serviceKey)) {
      // Read configuration from environment or use defaults
      const timeout = this.configService.get<number>('CIRCUIT_BREAKER_TIMEOUT', 10000);
      const resetTimeout = this.configService.get<number>('CIRCUIT_BREAKER_RESET_TIMEOUT', 30000);
      const errorThresholdPercentage = this.configService.get<number>('CIRCUIT_BREAKER_ERROR_THRESHOLD', 50);

      // Create new circuit breaker for this service
      const breaker = new CircuitBreaker(async (fn: Function) => fn(), {
        timeout: timeout, // 10 seconds by default
        errorThresholdPercentage: errorThresholdPercentage, // Open after 50% of requests fail
        resetTimeout: resetTimeout, // Try again after 30 seconds
        rollingCountTimeout: 60000, // 1 minute window
        rollingCountBuckets: 10, // 10 buckets of 6 seconds each
      });

      // Add listeners for circuit breaker events
      breaker.on('open', () => {
        this.logger.warn(`Circuit breaker for ${serviceKey} is now OPEN`);
      });

      breaker.on('halfOpen', () => {
        this.logger.log(`Circuit breaker for ${serviceKey} is now HALF-OPEN`);
      });

      breaker.on('close', () => {
        this.logger.log(`Circuit breaker for ${serviceKey} is now CLOSED`);
      });

      breaker.on('fallback', () => {
        this.logger.warn(`Circuit breaker fallback for ${serviceKey}`);
      });

      this.breakers.set(serviceKey, breaker);
    }

    return this.breakers.get(serviceKey);
  }

  async call(serviceKey: string, fn: Function) {
    const breaker = this.getBreaker(serviceKey);

    try {
      return await breaker.fire(fn);
    } catch (error) {
      // Log detailed error
      const err = error as Error;

      this.logger.error(`Service ${serviceKey} failed: ${err.message}`, err.stack);

      // Throw appropriate exception
      throw new ServiceUnavailableException(
        `Service ${serviceKey.split('//')[1]} is currently unavailable. Please try again later.`,
      );

      // Throw appropriate exception
      throw new ServiceUnavailableException(
        `Service ${serviceKey.split('//')[1]} is currently unavailable. Please try again later.`,
      );
    }
  }

  async callWithFallback(serviceKey: string, fn: Function, fallbackFn: Function) {
    const breaker = this.getBreaker(serviceKey);
    breaker.fallback(fallbackFn);

    return await breaker.fire(fn);
  }
}
