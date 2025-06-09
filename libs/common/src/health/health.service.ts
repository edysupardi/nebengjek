import { Injectable, Inject, Logger } from '@nestjs/common';
import { HealthOptions, HealthCheckResult } from '@app/common/interfaces/';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: any,
    @Inject('PRISMA_SERVICE') private readonly prismaService: any,
    @Inject('HEALTH_OPTIONS') private readonly options: HealthOptions,
  ) {}

  async checkOverallHealth() {
    const [redis, database, additionalChecks] = await Promise.all([
      this.checkRedisHealth(),
      this.checkDatabaseHealth(),
      this.checkAdditional(),
    ]);

    const additionalChecksArray = Object.values(additionalChecks) as HealthCheckResult[];
    const isHealthy =
      redis.status === 'up' && database.status === 'up' && additionalChecksArray.every(check => check.status === 'up');

    return {
      service: this.options.serviceName,
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      details: {
        redis,
        database,
        ...additionalChecks,
      },
    };
  }

  async checkRedisHealth(): Promise<HealthCheckResult> {
    try {
      await this.redisClient.ping();
      return { status: 'up' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis health check failed: ${errorMessage}`);
      return {
        status: 'down',
        error: errorMessage,
      };
    }
  }

  async checkDatabaseHealth(): Promise<HealthCheckResult> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Database health check failed: ${errorMessage}`);
      return {
        status: 'down',
        error: errorMessage,
      };
    }
  }

  private async checkAdditional(): Promise<Record<string, HealthCheckResult>> {
    const result: Record<string, HealthCheckResult> = {};

    for (const [name, checkFn] of Object.entries(this.options.additionalChecks)) {
      try {
        const isHealthy = await checkFn();
        result[name] = { status: isHealthy ? 'up' : 'down' };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Additional health check "${name}" failed: ${errorMessage}`);
        result[name] = {
          status: 'down',
          error: errorMessage,
        };
      }
    }

    return result;
  }
}
