// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NotificationModule } from '@app/notification/notification.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule);
  
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('NOTIFICATION_PORT', 3004);
  
  await app.listen(port);
  console.log(`Notification Service is running on port ${port}`);
}
bootstrap();