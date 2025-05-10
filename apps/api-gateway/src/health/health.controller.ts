import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Check all microservices health endpoints
      () => this.http.pingCheck('user-service', `http://${this.configService.get('USER_SERVICE_HOST')}:${this.configService.get('USER_SERVICE_PORT')}/health`),
      () => this.http.pingCheck('booking-service', `http://${this.configService.get('BOOKING_SERVICE_HOST')}:${this.configService.get('BOOKING_SERVICE_PORT')}/health`),
      // Other services...
    ]);
  }

  @Get('liveness')
  liveness() {
    // Simple check for AWS health check
    return { status: 'ok' };
  }
}