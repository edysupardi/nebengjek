import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from '@app/apigateway/circuit-breaker/circuit-breaker.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private circuitBreaker: CircuitBreakerService,
  ) {}

  async forwardRequest(serviceUrl: string, method: string, path: string, headers: any, body?: any, query?: any) {
    const url = `${serviceUrl}${path}`;

    // Use circuit breaker to prevent cascade failures
    return this.circuitBreaker.call(serviceUrl, async () => {
      const startTime = Date.now();

      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url,
          headers: {
            ...headers,
            'x-request-id': headers['x-request-id'],
            'x-forwarded-for': headers['x-forwarded-for'],
          },
          data: body,
          params: query,
        }),
      );

      const duration = Date.now() - startTime;
      this.logger.log(`${method} ${url} completed in ${duration}ms`);

      return {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };
    });
  }
}
