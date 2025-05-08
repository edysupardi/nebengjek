import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { PaymentController } from '@app/payment/payment.controller';
import { PaymentService } from '@app/payment/payment.service';
import { TransactionRepository } from '@app/payment/repositories/transaction.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, TransactionRepository],
  exports: [PaymentService],
})
export class PaymentModule {}