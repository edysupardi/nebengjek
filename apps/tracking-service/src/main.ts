import { ResponseInterceptor } from '@app/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { TrackingModule } from './tracking.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(TrackingModule);

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

  const moduleRef = app.select(TrackingModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths)); // interceptor for response format

  // ADD WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // eslint-disable-next-line no-undef
  const port = process.env.TRACKING_PORT || 3003;
  logger.log(`Tracking service is running on port ${port}`);
  await app.listen(port);

  // eslint-disable-next-line no-undef
  const wsPort = process.env.TRACKING_WS_PORT || 3060;
  logger.log(`WebSocket server running on port ${wsPort}`);
}
bootstrap();
