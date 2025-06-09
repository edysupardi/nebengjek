import { ResponseInterceptor } from '@app/common/interceptors/response.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import 'reflect-metadata';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const logger = app.get(Logger);
  app.useLogger(logger); // beauty logger for nestjs
  app.enableCors(); // enable CORS for all routes
  app.use(helmet.hidePoweredBy()); // hide X-Powered-By header

  const moduleRef = app.select(AppModule);
  const reflector = moduleRef.get(Reflector);
  const excludedPaths = [''];
  app.useGlobalInterceptors(new ResponseInterceptor(reflector, excludedPaths)); // interceptor for response format

  // eslint-disable-next-line no-undef
  const port = process.env.USER_PORT || 3001;
  // eslint-disable-next-line no-undef
  const tcpPort = Number(process.env.USER_TCP_PORT) || 8008;

  logger.log(`User service is running on port ${port}`);
  await app.listen(port);

  // Create TCP microservice
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  await microservice.listen();
  logger.log(`User TCP microservice running on port ${tcpPort}`);
}
bootstrap();
