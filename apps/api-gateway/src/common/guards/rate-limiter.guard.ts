import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RateLimiterGuard.name);
  private readonly redis: Redis;
  private readonly ttl: number;
  private readonly limit: number;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    // Connect to Redis
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });

    // Default rate limits: 100 requests per minute
    this.ttl = this.configService.get<number>('RATE_LIMIT_TTL', 60);
    this.limit = this.configService.get<number>('RATE_LIMIT_LIMIT', 100);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is excluded from rate limiting
    const isRateLimitDisabled = this.reflector.get<boolean>('skipRateLimit', context.getHandler());
    if (isRateLimitDisabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.generateKey(request);

    // Use Redis to track request counts
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, this.ttl);
    }

    if (current > this.limit) {
      const remaining = await this.redis.ttl(key);
      this.logger.warn(`Rate limit exceeded for ${key}. Limit: ${this.limit}, Current: ${current}`);
      throw new ThrottlerException(`Rate limit exceeded. Try again in ${remaining} seconds.`);
    }

    return true;
  }

  private generateKey(request: Request): string {
    // Create key based on IP address or API key or user ID
    // For this implementation, we'll use IP address
    const ip = request.ip || 
              request.ips?.[0] || 
              request.headers['x-forwarded-for'] || 
              'unknown';
    
    // Add path to make rate limit specific to endpoints
    const path = request.path;
    
    return `rate_limit:${ip}:${path}`;
  }
}