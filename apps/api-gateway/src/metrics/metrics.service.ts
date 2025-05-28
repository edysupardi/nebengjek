import { Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectMetric('http_requests_total') 
    private readonly requestCounter: Counter<string>,
    @InjectMetric('http_request_duration_seconds') 
    private readonly requestDuration: Histogram<string>,
    @InjectMetric('service_up') 
    private readonly serviceUpGauge: Gauge<string>,
  ) {}

  incrementRequestCount(method: string, path: string, statusCode: number) {
    this.requestCounter.inc({ method, path, code: statusCode.toString() });
  }

  recordRequestDuration(method: string, path: string, duration: number) {
    this.requestDuration.observe({ method, path }, duration / 1000); // Convert ms to seconds
  }

  setServiceStatus(service: string, isUp: boolean) {
    this.serviceUpGauge.set({ service }, isUp ? 1 : 0);
    if (!isUp) {
      this.logger.warn(`Service ${service} is down`);
    }
  }

  getMetricsSummary() {
    return {
      message: 'For full metrics in Prometheus format, use the /metrics endpoint',
      endpoints: {
        prometheus: '/metrics',
        kubernetes: '/health',
      },
    };
  }
}