import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { TrackingModule } from './tracking.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ResponseInterceptor } from '@app/common';
import { Logger } from 'nestjs-pino';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(TrackingModule);
  
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

  const moduleRef = app.select(TrackingModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths)); // interceptor for response format 

  // ✅ ADD WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env.TRACKING_PORT || 3003;
  console.log(`Tracking service is running on port ${port}`);
  await app.listen(port);

  const wsPort = process.env.TRACKING_WS_PORT || 3060;
  console.log(`WebSocket server running on port ${wsPort}`);
}
bootstrap();