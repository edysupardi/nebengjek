import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as CircuitBreaker from 'opossum';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, any>();
  
  getBreaker(serviceKey: string) {
    if (!this.breakers.has(serviceKey)) {
      // Create new circuit breaker for this service
      const breaker = new CircuitBreaker(
        async (fn: Function) => fn(),
        {
          timeout: 10000, // 10 seconds
          errorThresholdPercentage: 50, // Open after 50% of requests fail
          resetTimeout: 30000, // Try again after 30 seconds
          rollingCountTimeout: 60000, // 1 minute window
          rollingCountBuckets: 10, // 10 buckets of 6 seconds each
        }
      );
      
      // Add listeners for events
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
      // Log detailed error for operations 
      this.logger.error(
        `Service ${serviceKey} failed: ${error.message}`,
        error.stack
      );
      
      // Provide fallback response or throw appropriate error
      throw new ServiceUnavailableException(
        `Service ${serviceKey.split('//')[1]} is currently unavailable. Please try again later.`
      );
    }
  }
  
  // Method to provide fallback for critical services
  async callWithFallback(
    serviceKey: string, 
    fn: Function, 
    fallbackFn: Function
  ) {
    const breaker = this.getBreaker(serviceKey);
    breaker.fallback(fallbackFn);
    
    return await breaker.fire(fn);
  }
}