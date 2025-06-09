import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    // Enhanced configuration for production
    super({
      datasources: {
        db: {
          url: configService.get<string>('DATABASE_URL'),
        },
      },
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
      errorFormat: 'colorless',
    });

    // Enhanced logging for production debugging
    (this as any).$on('query' as any, (e: any) => {
      if (this.configService.get('NODE_ENV') === 'development') {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      }
    });

    (this as any).$on('error' as any, (e: any) => {
      this.logger.error('Database Error:', e);
    });

    (this as any).$on('warn' as any, (e: any) => {
      this.logger.warn('Database Warning:', e);
    });

    (this as any).$on('info' as any, (e: any) => {
      this.logger.log('Database Info:', e);
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to database...');

    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');

      // Test connection with a simple query
      await this.$queryRaw`SELECT 1`;
      this.logger.log('✅ Database query test successful');

      // Log database info (without sensitive data)
      const databaseUrl = this.configService.get<string>('DATABASE_URL') || '';
      const urlObj = new URL(databaseUrl);
      this.logger.log(`Connected to: ${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`);
    } catch (error) {
      this.logger.error('❌ Database connection failed:', error);

      // Enhanced error information for debugging
      const databaseUrl = this.configService.get<string>('DATABASE_URL') || '';
      if (databaseUrl) {
        try {
          const urlObj = new URL(databaseUrl as string);
          this.logger.error(`Database host: ${urlObj.hostname}`);
          this.logger.error(`Database port: ${urlObj.port}`);
          this.logger.error(`Database name: ${urlObj.pathname}`);
        } catch (urlError) {
          this.logger.error('Invalid DATABASE_URL format');
        }
      } else {
        this.logger.error('DATABASE_URL environment variable not set');
      }

      throw error;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('✅ Database disconnected');
  }

  // Health check method for monitoring
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }

  // Enhanced error handling for common connection issues
  async executeWithRetry<T>(operation: () => Promise<T>, maxRetries: number = 3, delayMs: number = 1000): Promise<T> {
    let lastError: Error = new Error('Operation failed after maximum retries');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }

    throw lastError;
  }
}
