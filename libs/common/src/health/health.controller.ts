import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async checkHealth() {
    return this.healthService.checkOverallHealth();
  }

  @Get('redis')
  async checkRedis() {
    return this.healthService.checkRedisHealth();
  }

  @Get('database')
  async checkDatabase() {
    return this.healthService.checkDatabaseHealth();
  }
}