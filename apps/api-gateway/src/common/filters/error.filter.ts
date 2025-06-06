// apps/api-gateway/src/common/filters/error.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import * as winston from 'winston';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: winston.Logger) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Ekstrak detail error
    const message = this.getErrorMessage(exception);
    const stack = this.getErrorStack(exception);
    const errorName = this.getErrorName(exception);

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      requestId: request.headers['x-request-id'] || 'unknown',
    };

    // Log error dengan level yang sesuai berdasarkan status code
    if (status >= 500) {
      this.logger.error(`Error ${errorResponse.requestId}: ${status} - ${request.method} ${request.url}`, {
        error: {
          name: errorName,
          message,
          stack,
        },
        context: 'ErrorHandler',
      });
    } else if (status >= 400) {
      this.logger.warn(`Warning ${errorResponse.requestId}: ${status} - ${request.method} ${request.url}`, {
        error: {
          name: errorName,
          message,
        },
        context: 'ErrorHandler',
      });
    }

    // Send error response
    response.status(status).json(errorResponse);
  }

  private getErrorMessage(exception: any): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && 'message' in response) {
        return Array.isArray(response.message) ? response.message.join(', ') : String(response.message);
      }
      return exception.message;
    }

    return exception?.message || 'Internal server error';
  }

  private getErrorStack(exception: any): string | undefined {
    return exception?.stack;
  }

  private getErrorName(exception: any): string {
    return exception?.name || exception?.constructor?.name || 'Error';
  }
}
