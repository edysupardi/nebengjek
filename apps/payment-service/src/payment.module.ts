import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule, PrismaService } from '@app/database';
import { PaymentController } from '@app/payment/payment.controller';
import { PaymentService } from '@app/payment/payment.service';
import { TransactionRepository } from '@app/payment/repositories/transaction.repository';
import { HealthModule } from '@app/common';
import { LoggingModule } from '@app/common/modules/logging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    LoggingModule,
    HealthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const Redis = require('ioredis');
        return {
          redis: new Redis({
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
          }),
          prisma: new PrismaService(),
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [PaymentController],
  providers: [PaymentService, TransactionRepository],
  exports: [PaymentService],
})
export class PaymentModule {}
