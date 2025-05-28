import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '@app/common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  async checkHealth() {
    return this.healthService.checkOverallHealth();
  }

  @Get('redis')
  @Public()
  async checkRedis() {
    return this.healthService.checkRedisHealth();
  }

  @Get('database')
  @Public()
  async checkDatabase() {
    return this.healthService.checkDatabaseHealth();
  }
}