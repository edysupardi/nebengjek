// apps/api-gateway/src/common/interceptors/logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger: winston.Logger;

  constructor(private configService: ConfigService) {
    // Buat Winston logger
    this.logger = winston.createLogger({
      // Import opsi dari file konfigurasi
      ...require('../config/winston.config').createWinstonLoggerOptions(configService),
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Buat atau dapatkan request ID
    const requestId = request.headers['x-request-id'] as string || uuidv4();
    
    // Tambahkan request ID ke header response jika belum ada
    if (!response.getHeader('x-request-id')) {
      response.setHeader('x-request-id', requestId);
    }

    // Log request
    const { method, originalUrl, ip, headers, body, query } = request;
    const userAgent = headers['user-agent'] || '';
    
    this.logger.info(`Request: ${method} ${originalUrl}`, {
      context: 'HttpRequest',
      requestId,
      ip,
      userAgent,
      body: this.sanitizeBody(body), // Sanitasi data sensitif
      query,
      headers: this.filterHeaders(headers), // Hanya log header tertentu
    });

    const now = Date.now();
    
    return next.handle().pipe(
      tap({
        next: (data: any) => {
          // Log response success
          const responseTime = Date.now() - now;
          
          this.logger.info(`Response: ${method} ${originalUrl} - ${response.statusCode} (${responseTime}ms)`, {
            context: 'HttpResponse',
            requestId,
            statusCode: response.statusCode,
            responseTime,
            responseSize: this.calculateResponseSize(data),
          });
          
          // Tambahan untuk AWS X-Ray di production
          this.addXRayMetadata(requestId, method, originalUrl, responseTime);
        },
        error: (error: any) => {
          // Log response error
          const responseTime = Date.now() - now;
          
          this.logger.error(`Error: ${method} ${originalUrl} - ${error.status || 500} (${responseTime}ms)`, {
            context: 'HttpError',
            requestId,
            statusCode: error.status || 500,
            responseTime,
            error: {
              name: error.name,
              message: error.message,
              stack: this.shouldLogStack() ? error.stack : undefined,
            },
          });
          
          // Tambahan untuk AWS X-Ray di production
          this.addXRayMetadata(requestId, method, originalUrl, responseTime, error);
        },
      }),
    );
  }

  // Sanitasi data sensitif dari body request
  private sanitizeBody(body: any): any {
    if (!body) return {};
    
    const sanitized = { ...body };
    
    // List field sensitif untuk disanitasi
    const sensitiveFields = ['password', 'passwordConfirmation', 'currentPassword', 'token', 'refreshToken', 'credit_card', 'cardNumber'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  // Filter header yang akan di-log
  private filterHeaders(headers: any): any {
    const filtered = { ...headers };
    
    // Header yang boleh di-log
    const allowedHeaders = ['user-agent', 'accept', 'content-type', 'origin', 'referer', 'x-request-id'];
    
    Object.keys(filtered).forEach(key => {
      if (!allowedHeaders.includes(key.toLowerCase())) {
        delete filtered[key];
      }
    });
    
    return filtered;
  }

  // Hitung perkiraan ukuran response
  private calculateResponseSize(data: any): number {
    if (!data) return 0;
    
    if (typeof data === 'string') {
      return data.length;
    }
    
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  // Tentukan apakah stack trace harus di-log
  private shouldLogStack(): boolean {
    return this.configService.get('NODE_ENV', 'development') !== 'production';
  }

  // Tambahkan metadata ke AWS X-Ray jika di production
  private addXRayMetadata(requestId: string, method: string, url: string, responseTime: number, error?: any): void {
    if (this.configService.get('NODE_ENV') === 'production') {
      try {
        const AWSXRay = require('aws-xray-sdk');
        const segment = AWSXRay.getSegment();
        
        if (segment) {
          const subsegment = segment.addNewSubsegment('api-gateway');
          subsegment.addAnnotation('requestId', requestId);
          subsegment.addAnnotation('method', method);
          subsegment.addAnnotation('url', url);
          subsegment.addAnnotation('responseTime', responseTime);
          
          if (error) {
            subsegment.addError(error);
          }
          
          subsegment.close();
        }
      } catch (e) {
        // Ignore errors in X-Ray integration
      }
    }
  }
}