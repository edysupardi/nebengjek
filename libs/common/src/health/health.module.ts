import { Module, DynamicModule, Provider } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

export interface HealthModuleOptions {
  redis: any;
  prisma: any;
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
        HealthService,
        {
          provide: 'REDIS_CLIENT',
          useValue: options.redis,
        },
        {
          provide: 'PRISMA_SERVICE',
          useValue: options.prisma,
        },
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