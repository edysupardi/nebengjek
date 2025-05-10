import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as winston from 'winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger = new Logger('API');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, ip, body } = request;
    const userAgent = request.get('user-agent') || '';
    const requestId = request.id; // From request-id middleware
    
    // Log request
    this.logger.log(
      `Request ${requestId}: ${method} ${originalUrl} - ${ip} - ${userAgent}`
    );

    const now = Date.now();
    return next.handle().pipe(
      tap(response => {
        // Log response
        const responseTime = Date.now() - now;
        this.logger.log(
          `Response ${requestId}: ${method} ${originalUrl} - ${responseTime}ms`
        );
        
        // For AWS X-Ray tracing
        if (process.env.NODE_ENV === 'production') {
          const AWSXRay = require('aws-xray-sdk');
          const segment = AWSXRay.getSegment();
          
          if (segment) {
            const subsegment = segment.addNewSubsegment('api-gateway');
            subsegment.addAnnotation('responseTime', responseTime);
            subsegment.close();
          }
        }
      })
    );
  }
}