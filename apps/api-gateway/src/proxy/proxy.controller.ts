import { 
  All, 
  Body, 
  Controller, 
  Param, 
  Req, 
  Res, 
  Logger,
  HttpException,
  HttpStatus 
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { ServiceType } from '../common/enums/service-type.enum';

@ApiTags('Proxy')
@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  // Route for user service
  @All('api/users/*')
  @ApiExcludeEndpoint()
  async proxyUserService(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest('USER_SERVICE', req, res);
  }

  // Route for booking service
  @All('api/bookings/*')
  @ApiExcludeEndpoint()
  async proxyBookingService(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest('BOOKING_SERVICE', req, res);
  }

  // Route for matching service
  @All('api/matching/*')
  @ApiExcludeEndpoint()
  async proxyMatchingService(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest('MATCHING_SERVICE', req, res);
  }

  // Route for payment service
  @All('api/payments/*')
  @ApiExcludeEndpoint()
  async proxyPaymentService(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest('PAYMENT_SERVICE', req, res);
  }

  // Route for notification service
  @All('api/notifications/*')
  @ApiExcludeEndpoint()
  async proxyNotificationService(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest('NOTIFICATION_SERVICE', req, res);
  }

  // Route for tracking service
  @All('api/tracking/*')
  @ApiExcludeEndpoint()
  async proxyTrackingService(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest('TRACKING_SERVICE', req, res);
  }

  // Generic proxy handler method
  private async proxyRequest(
    serviceEnvPrefix: string,
    req: Request,
    res: Response,
  ) {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    
    // Add request ID if not present
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = requestId;
    }

    try {
      // Get path without the service prefix (e.g., /api/users/123 -> /123 for USER_SERVICE)
      const servicePath = this.extractServicePath(serviceEnvPrefix, req.path);
      
      // Get target service URL from environment variables
      const serviceHost = process.env[`${serviceEnvPrefix}_HOST`] || 'localhost';
      const servicePort = process.env[`${serviceEnvPrefix}_PORT`] || '3000';
      const serviceUrl = `http://${serviceHost}:${servicePort}`;
      
      this.logger.log(`[${requestId}] Proxying ${req.method} ${req.path} -> ${serviceUrl}${servicePath}`);
      
      // Forward the request to the appropriate service
      const result = await this.proxyService.forwardRequest(
        serviceUrl,
        req.method,
        servicePath,
        req.headers,
        req.body,
        req.query,
      );
      
      // Set response headers
      Object.entries(result.headers).forEach(([key, value]) => {
        // Skip certain headers that might cause issues
        if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          res.setHeader(key, value as string);
        }
      });
      
      // Set request ID in response header
      res.setHeader('x-request-id', requestId);
      
      // Log completion
      const duration = Date.now() - startTime;
      this.logger.log(`[${requestId}] Completed ${req.method} ${req.path} -> ${serviceUrl}${servicePath} in ${duration}ms with status ${result.status}`);
      
      // Send response
      return res.status(result.status).send(result.data);
    } catch (error) {
      // Log error
      const duration = Date.now() - startTime;
      this.logger.error(
        `[${requestId}] Error proxying ${req.method} ${req.path} - ${duration}ms: ${this.getErrorMessage(error)}`,
        this.getErrorStack(error),
      );
      
      // Determine appropriate error response
      const statusCode = this.getErrorStatusCode(error);
      const errorMessage = this.getErrorMessage(error);
      
      // Send error response
      return res.status(statusCode).json({
        statusCode,
        message: errorMessage,
        path: req.path,
        timestamp: new Date().toISOString(),
        requestId,
      });
    }
  }

  private extractServicePath(serviceEnvPrefix: string, fullPath: string): string {
    const servicePrefixMap = {
      [ServiceType.USER_SERVICE]: '/api/users',
      [ServiceType.BOOKING_SERVICE]: '/api/bookings',
      [ServiceType.MATCHING_SERVICE]: '/api/matching',
      [ServiceType.PAYMENT_SERVICE]: '/api/payments',
      [ServiceType.NOTIFICATION_SERVICE]: '/api/notifications',
      [ServiceType.TRACKING_SERVICE]: '/api/tracking',
    };
    
    // Gunakan type assertion untuk memberi tahu TypeScript bahwa key pasti valid
    const prefix = servicePrefixMap[serviceEnvPrefix as keyof typeof servicePrefixMap];
    if (prefix && fullPath.startsWith(prefix)) {
      // Return path without the service prefix, or / if it's just the prefix
      const remaining = fullPath.substring(prefix.length);
      return remaining || '/';
    }
    
    return fullPath; // Fallback
  }

  // Helper methods for error handling with proper type checking
  private getErrorStatusCode(error: unknown): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }
    
    // If it's an object with a status property, use that
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status: unknown }).status;
      if (typeof status === 'number') {
        return status;
      }
    }
    
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      return error.message;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
    
    return 'An unexpected error occurred';
  }

  private getErrorStack(error: unknown): string | undefined {
    if (error instanceof Error) {
      return error.stack;
    }
    
    if (typeof error === 'object' && error !== null && 'stack' in error) {
      const stack = (error as { stack: unknown }).stack;
      if (typeof stack === 'string') {
        return stack;
      }
    }
    
    return undefined;
  }
}