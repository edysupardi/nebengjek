import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import helmet from 'helmet';
import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
import { Logger } from 'nestjs-pino';
import { MatchingModule } from './algorithm/matching.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(MatchingModule);

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

  const moduleRef = app.select(MatchingModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths));

  const httpPort = process.env.MATCHING_PORT || 3006;
  const tcpPort = Number(process.env.MATCHING_TCP_PORT) || 8006;

  // Start HTTP server
  await app.listen(httpPort);
  console.log(`Matching HTTP service running on port ${httpPort}`);

  // Create TCP microservice
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(
    MatchingModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: tcpPort,
      },
    },
  );

  await microservice.listen();
  console.log(`Matching TCP microservice running on port ${tcpPort}`);
}

bootstrap();