import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const status = 
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    
    // Get detailed error info
    const message = 
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';
    
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      requestId: request.headers['x-request-id'],
    };
    
    // Log error with details
    if (status >= 500) {
      this.logger.error(
        `Error ${errorResponse.requestId}: ${status} - ${request.method} ${request.url}`,
        exception.stack
      );
      
      // Send error to CloudWatch in production
      if (process.env.NODE_ENV === 'production') {
        // AWS specific error reporting
      }
    } else {
      this.logger.warn(
        `Warning ${errorResponse.requestId}: ${status} - ${request.method} ${request.url} - ${message}`
      );
    }
    
    response.status(status).json(errorResponse);
  }
}