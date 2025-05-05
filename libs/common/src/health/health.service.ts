import { Injectable, Inject } from '@nestjs/common';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  service: string;
  error?: string;
}

export interface OverallHealthResult {
  status: 'healthy' | 'unhealthy';
  services: {
    [key: string]: HealthCheckResult;
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject('REDIS_CLIENT') private redis: any,
    @Inject('PRISMA_SERVICE') private prisma: any,
  ) {}

  async checkRedisHealth(): Promise<HealthCheckResult> {
    try {
      await this.redis.ping();
      return { status: 'healthy', service: 'redis' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'unhealthy', service: 'redis', error: errorMessage };
    }
  }

  async checkDatabaseHealth(): Promise<HealthCheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', service: 'database' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'unhealthy', service: 'database', error: errorMessage };
    }
  }

  async checkOverallHealth(): Promise<OverallHealthResult> {
    const redisHealth = await this.checkRedisHealth();
    const dbHealth = await this.checkDatabaseHealth();

    const isHealthy = redisHealth.status === 'healthy' && dbHealth.status === 'healthy';

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      services: {
        redis: redisHealth,
        database: dbHealth,
      },
      timestamp: new Date().toISOString(),
    };
  }
}