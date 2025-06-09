import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
import { Logger } from 'nestjs-pino';
import { PaymentModule } from './payment.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(PaymentModule);

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const logger = app.get(Logger);
  app.useLogger(logger); // beauty logger for nestjs

  // enable CORS for all routes
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(helmet.hidePoweredBy()); // hide X-Powered-By header

  const moduleRef = app.select(PaymentModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths)); // interceptor for response format

  const httpPort = process.env.PAYMENT_PORT || 3005;
  const tcpPort = Number(process.env.PAYMENT_TCP_PORT) || 8007;

  await app.listen(httpPort);
  console.log(`Payment Service is running on port ${httpPort}`);

  // Create TCP microservice
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(PaymentModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  await microservice.listen();
  console.log(`Payment TCP microservice running on port ${tcpPort}`);
}
bootstrap();
