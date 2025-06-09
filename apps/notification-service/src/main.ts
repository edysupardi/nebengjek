// import { NestFactory, Reflector } from '@nestjs/core';
// import { ValidationPipe } from '@nestjs/common';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
// import helmet from 'helmet';
// import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
// import { Logger } from 'nestjs-pino';
// import { NotificationModule } from './notification.module';

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(NotificationModule);

//   // Enable validation
//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       transform: true,
//     }),
//   );

//   const logger = app.get(Logger);
//   app.useLogger(logger); // beauty logger for nestjs

//   // enable CORS for all routes
//   app.enableCors({
//     origin: true,
//     credentials: true,
//   });

//   app.use(helmet.hidePoweredBy()); // hide X-Powered-By header

//   const moduleRef = app.select(NotificationModule);
//   const reflector = moduleRef.get(Reflector);
//   const excludedPaths = [''];
//   app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths));

//   const httpPort = process.env.NOTIFICATION_PORT || 3004;
//   const tcpPort = Number(process.env.NOTIFICATION_TCP_PORT) || 8004;

//   // Start HTTP server
//   await app.listen(httpPort);
//   console.log(`Notification HTTP Service running on port ${httpPort}`);

//   // Create TCP microservice
//   const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationModule, {
//     transport: Transport.TCP,
//     options: {
//       host: '0.0.0.0',
//       port: tcpPort,
//     },
//   });

//   await microservice.listen();
//   console.log(`Notification TCP microservice running on port ${tcpPort}`);
// }

// bootstrap();

// src/main.ts
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const logger = new Logger('NotificationService');

  const app = await NestFactory.create(NotificationModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const tcpPort = parseInt(process.env.NOTIFICATION_TCP_PORT || '8004');
  const tcpHost = process.env.NOTIFICATION_SERVICE_HOST || '0.0.0.0';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: tcpHost,
      port: tcpPort,
    },
  });

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.startAllMicroservices();

  const httpPort = parseInt(process.env.NOTIFICATION_PORT || '3004');
  await app.listen(httpPort);

  logger.log(`🚀 Notification Service running on:`);
  logger.log(`   HTTP: http://localhost:${httpPort}`);
  logger.log(`   TCP: ${tcpHost}:${tcpPort}`);
  logger.log(`   WebSocket: ws://localhost:${httpPort}`);
}

bootstrap().catch(error => {
  console.error('Failed to start Notification Service:', error);
  process.exit(1);
});
