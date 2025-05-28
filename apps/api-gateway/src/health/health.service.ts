import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService extends HealthIndicator {
  private readonly logger = new Logger(HealthService.name);

  constructor(private configService: ConfigService) {
    super();
  }

  // Check API Gateway core components
  async checkApiGatewayComponents(): Promise<HealthIndicatorResult> {
    this.logger.debug('Checking API Gateway components');
    
    // We could check various components here like auth service, 
    // circuit breaker state, etc.
    
    const isHealthy = true; // Replace with actual checks as needed
    
    // Perhatikan bahwa getStatus() sudah mengembalikan HealthIndicatorResult
    const result = this.getStatus('api_gateway_core', isHealthy, {
      version: this.configService.get('npm_package_version', '1.0.0'),
      environment: this.configService.get('NODE_ENV', 'development'),
      componentsChecked: ['auth', 'routing', 'rate_limiting']
    });
  
    if (isHealthy) {
      return result;
    }
    
    throw new HealthCheckError(
      'API Gateway components check failed', 
      result
    );
  }

  // Check rate limiting state
  async checkRateLimiting(): Promise<HealthIndicatorResult> {
    this.logger.debug('Checking rate limiting component');
    
    // Here we could check if rate limiting is working correctly
    // e.g., by checking Redis connection if used for rate limiting
    
    const isHealthy = true; // Replace with actual check
    
    return this.getStatus('rate_limiting', isHealthy);
  }

  // Check circuit breaker state
  async checkCircuitBreaker(): Promise<HealthIndicatorResult> {
    this.logger.debug('Checking circuit breaker component');
    
    // Here we could check the status of circuit breakers
    // e.g., how many circuits are open/closed/half-open
    
    const isHealthy = true; // Replace with actual check
    
    return this.getStatus('circuit_breaker', isHealthy, {
      openCircuits: 0,
      halfOpenCircuits: 0,
      closedCircuits: 6 // Example - one for each microservice
    });
  }

  // Get API Gateway metrics
  async getMetrics(): Promise<Record<string, any>> {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }
}