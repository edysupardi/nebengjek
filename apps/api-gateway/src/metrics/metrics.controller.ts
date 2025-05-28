import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '@app/apigateway/metrics/metrics.service';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipAuth } from '@app/apigateway/common/decorators/skip-auth.decorator';
import { Public } from '@app/common/decorators/public.decorator';

@ApiTags('Metrics')
@Controller('internal/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get('summary')
  @SkipAuth()
  @ApiExcludeEndpoint()
  getSummary() {
    return this.metricsService.getMetricsSummary();
  }
}