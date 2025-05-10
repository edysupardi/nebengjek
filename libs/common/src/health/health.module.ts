import { Module, DynamicModule, Provider } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

export interface HealthModuleOptions {
  redis: any;
  prisma: any;
  serviceName?: string;
  additionalChecks?: Record<string, () => Promise<boolean>>;
}

export interface HealthModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<HealthModuleOptions> | HealthModuleOptions;
  inject?: any[];
}

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        {
          provide: 'HEALTH_OPTIONS',
          useValue: {
            serviceName: options.serviceName || 'unknown-service',
            additionalChecks: options.additionalChecks || {},
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: options.redis,
        },
        {
          provide: 'PRISMA_SERVICE',
          useValue: options.prisma,
        },
        HealthService,
      ],
      exports: [HealthService],
    };
  }

  static forRootAsync(options: HealthModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: 'HEALTH_MODULE_OPTIONS',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: HealthModule,
      imports: options.imports || [],
      controllers: [HealthController],
      providers: [
        optionsProvider,
        {
          provide: 'HEALTH_OPTIONS',
          useFactory: (opts: HealthModuleOptions) => ({
            serviceName: opts.serviceName || 'unknown-service',
            additionalChecks: opts.additionalChecks || {},
          }),
          inject: ['HEALTH_MODULE_OPTIONS'],
        },
        {
          provide: 'REDIS_CLIENT',
          useFactory: (opts: HealthModuleOptions) => opts.redis,
          inject: ['HEALTH_MODULE_OPTIONS'],
        },
        {
          provide: 'PRISMA_SERVICE',
          useFactory: (opts: HealthModuleOptions) => opts.prisma,
          inject: ['HEALTH_MODULE_OPTIONS'],
        },
        HealthService,
      ],
      exports: [HealthService],
    };
  }
}