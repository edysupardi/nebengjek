import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { BookingModule } from './booking.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
import { ref } from 'process';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(BookingModule);
  const logger = app.get(Logger);
  
  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  app.enableCors();
  app.useLogger(logger); // beauty logger for nestjs
  app.enableCors(); // enable CORS for all routes
  app.use(helmet.hidePoweredBy()); // hide X-Powered-By header

  const moduleRef = app.select(BookingModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];

  // Apply global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths));

  const port = process.env.BOOKING_PORT || 3004;
  logger.log(`Booking service is running on port ${port}`);
  await app.listen(port);
}
bootstrap();