import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { BookingModule } from '@app/booking/booking.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
import { Logger } from 'nestjs-pino';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(BookingModule);

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

  const moduleRef = app.select(BookingModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths)); // interceptor for response format

  const httpPort = process.env.BOOKING_PORT || 3002;
  const tcpPort = Number(process.env.BOOKING_TCP_PORT) || 8005;

  logger.log(`Booking service is running on port ${httpPort}`);
  await app.listen(httpPort);

  // Create TCP microservice
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(BookingModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  await microservice.listen();
  console.log(`Booking TCP microservice running on port ${tcpPort}`);
}
bootstrap();
