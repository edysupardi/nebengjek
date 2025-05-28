import { Module } from '@nestjs/common';
import { MetricsController } from '@app/apigateway/metrics/metrics.controller';
import { MetricsService } from '@app/apigateway/metrics/metrics.service';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}