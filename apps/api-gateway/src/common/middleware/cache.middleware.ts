import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redis.service';

@Injectable()
export class CacheMiddleware implements NestMiddleware {
  constructor(private redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `cache:${req.originalUrl}`;
    const cachedResponse = await this.redisService.get(cacheKey);

    if (cachedResponse) {
      return res.send(JSON.parse(cachedResponse));
    }

    // Store original send
    const originalSend = res.send;
    
    // Override send
    res.send = (body: any): Response => {
      // Cache successful responses for non-critical endpoints
      if (res.statusCode === 200 && !req.originalUrl.includes('/critical/')) {
        this.redisService.set(
          cacheKey, 
          JSON.stringify(body), 
          'EX', 
          300 // 5 minutes TTL
        );
      }
      
      return originalSend.call(res, body);
    };

    next();
  }
}