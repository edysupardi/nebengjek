// apps/payment-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { PaymentModule } from '@app/payment/payment.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(PaymentModule);
  
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PAYMENT_PORT', 3005);
  
  await app.listen(port);
  console.log(`Payment Service is running on port ${port}`);
}
bootstrap();