import { Controller, Get, Logger } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { SkipAuth } from '@app/apigateway/common/decorators/skip-auth.decorator';
import { SkipRateLimit } from '@app/apigateway/common/decorators/skip-rate-limit.decorator';
import { HealthService } from '@app/apigateway/health/health.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private configService: ConfigService,
    private healthService: HealthService,
  ) {}

  @Get()
  @HealthCheck()
  @SkipAuth()
  @SkipRateLimit()
  @ApiOperation({ summary: 'Check API Gateway and microservices health' })
  @ApiResponse({
    status: 200,
    description: 'Health check successful',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        info: { type: 'object' },
        error: { type: 'object' },
        details: { type: 'object' },
      },
    },
  })
  async check() {
    this.logger.log('Executing comprehensive health check');

    return this.health.check([
      // System checks
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024), // 200MB
      () => this.memory.checkRSS('memory_rss', 3000 * 1024 * 1024), // 3GB
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),

      // Microservices checks - run in parallel
      async () => this.checkMicroservices(),

      // Custom application checks
      async () => this.healthService.checkApiGatewayComponents(),
    ]);
  }

  @Get('liveness')
  @SkipAuth()
  @SkipRateLimit()
  @ApiOperation({ summary: 'Simple liveness check for load balancers' })
  @ApiResponse({
    status: 200,
    description: 'API Gateway is alive',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'up' },
        timestamp: { type: 'string', example: '2023-01-01T00:00:00.000Z' },
        uptime: { type: 'number', example: 3600 },
      },
    },
  })
  liveness() {
    const healthStatus = {
      status: 'up',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: this.configService.get('npm_package_version', '1.0.0'),
      environment: this.configService.get('NODE_ENV', 'development'),
    };

    this.logger.debug(`Liveness check: ${JSON.stringify(healthStatus)}`);
    return healthStatus;
  }

  @Get('readiness')
  @SkipAuth()
  @SkipRateLimit()
  @ApiOperation({ summary: 'Readiness check for load balancer traffic direction' })
  @ApiResponse({
    status: 200,
    description: 'API Gateway is ready to accept requests',
  })
  async readiness() {
    // Untuk readiness check, kita hanya perlu memastikan bahwa APIs
    // kritis tersedia, tidak semua microservices

    const criticalServices = ['user-service', 'booking-service'];

    const checks = criticalServices.map(service => {
      const envPrefix = service.toUpperCase().replace(/-/g, '_');
      return () =>
        this.checkService(
          service,
          this.configService.get(`${envPrefix}_HOST`, 'localhost'),
          this.configService.get(`${envPrefix}_PORT`, '3000'),
        );
    });

    return this.health.check(checks);
  }

  // Check all microservices
  private async checkMicroservices(): Promise<HealthIndicatorResult> {
    const services = [
      { name: 'user-service', envPrefix: 'USER_SERVICE' },
      { name: 'booking-service', envPrefix: 'BOOKING_SERVICE' },
      { name: 'matching-service', envPrefix: 'MATCHING_SERVICE' },
      { name: 'payment-service', envPrefix: 'PAYMENT_SERVICE' },
      { name: 'notification-service', envPrefix: 'NOTIFICATION_SERVICE' },
      { name: 'tracking-service', envPrefix: 'TRACKING_SERVICE' },
    ];

    const results = await Promise.allSettled(
      services.map(service =>
        this.checkService(
          service.name,
          this.configService.get(`${service.envPrefix}_HOST`, 'localhost'),
          this.configService.get(`${service.envPrefix}_PORT`, '3000'),
        ),
      ),
    );

    // Process results
    const microservicesHealth: HealthIndicatorResult = {};
    let allHealthy = true;

    results.forEach((result, index) => {
      const serviceName = services[index].name;

      if (result.status === 'fulfilled') {
        // Copy the individual service health result
        microservicesHealth[serviceName] = result.value[serviceName];
      } else {
        allHealthy = false;
        microservicesHealth[serviceName] = {
          status: 'down',
          error: result.reason?.message || 'Unknown error',
        };
      }
    });

    // Add an overall status
    microservicesHealth['microservices'] = {
      status: allHealthy ? 'up' : 'down',
      servicesChecked: services.length,
      servicesUp: results.filter(r => r.status === 'fulfilled').length,
    };

    return microservicesHealth;
  }

  // Check individual service
  private async checkService(name: string, host: string, port: string): Promise<HealthIndicatorResult> {
    const serviceUrl = `http://${host}:${port}/health`;
    this.logger.debug(`Checking health of ${name} at ${serviceUrl}`);

    try {
      // http.pingCheck already returns HealthIndicatorResult
      return await this.http.pingCheck(name, serviceUrl);
    } catch (error) {
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = String((error as any).message || 'Object error');
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      this.logger.warn(`Health check failed for ${name}: ${errorMessage}`);
      throw error;
    }
  }
}
