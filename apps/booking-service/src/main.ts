import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { BookingModule } from './booking.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(BookingModule);
  
  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
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

  const port = process.env.BOOKING_PORT || 3002;
  logger.log(`Booking service is running on port ${port}`);
  await app.listen(port);
}
bootstrap();