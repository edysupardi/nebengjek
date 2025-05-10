import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ResponseInterceptor } from '@app/common/interceptors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get configuration
  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_GATEWAY_PORT', 3000);
  
  // Global prefix
  app.setGlobalPrefix('api');
  
  // Global pipes and interceptors
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  // CORS
  app.enableCors();
  
  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('NebengJek API')
    .setDescription('The NebengJek API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  
  await app.listen(port);
  console.log(`API Gateway is running on port ${port}`);
}

bootstrap();