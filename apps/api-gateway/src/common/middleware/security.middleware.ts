import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import * as xss from 'xss';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private helmetMiddleware;
  private readonly logger = new Logger(SecurityMiddleware.name);
  private gatewaySecret: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.helmetMiddleware = helmet();
    // Secret untuk mengamankan komunikasi antar service
    this.gatewaySecret = this.configService.get('GATEWAY_SECRET_KEY') || crypto.randomBytes(32).toString('hex'); // Fallback random secret
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Apply helmet middleware
    this.helmetMiddleware(req, res, () => {
      // XSS protection
      this.applyXssProtection(req);

      // Set security headers
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // Remove common security headers from internal service routing
      if (this.isInternalServiceRequest(req)) {
        this.addTrustedServiceHeaders(req);
        return next();
      }

      // Check public routes that don't require authentication
      const publicRoutes = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/refresh-token',
        '/api/health',
        '/health',
        '/metrics',
        '/api/docs',
        '/api/swagger',
      ];

      if (publicRoutes.some(route => req.path.startsWith(route))) {
        return next();
      }

      // JWT verification for protected routes
      const token = this.extractTokenFromHeader(req);
      if (!token) {
        return res.status(401).json({
          statusCode: 401,
          message: 'Unauthorized',
          timestamp: new Date().toISOString(),
          path: req.path,
        });
      }

      try {
        // Verify JWT token
        const payload = this.jwtService.verify(token, {
          secret: this.configService.get('JWT_ACCESS_SECRET'),
        });

        // Set user info in request object for API Gateway's own use
        req.user = payload;

        // Add trusted headers for downstream microservices
        this.addTrustedHeaders(req, payload);

        // Log successful authentication
        this.logger.debug(`Authenticated user: ${payload.sub} | Roles: ${JSON.stringify(payload.roles || [])}`);

        next();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Authentication failed: ${errorMessage}`);
        return res.status(401).json({
          statusCode: 401,
          message: 'Invalid token',
          timestamp: new Date().toISOString(),
          path: req.path,
        });
      }
    });
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  // Metode untuk menerapkan XSS protection dengan library xss
  private applyXssProtection(req: Request): void {
    const xssFilter = new xss.FilterXSS({
      whiteList: {}, // No tags allowed by default
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script'],
    });

    // Sanitize query parameters
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = xssFilter.process(req.query[key] as string);
        }
      });
    }

    // Sanitize request body
    if (req.body) {
      this.sanitizeObject(req.body, xssFilter);
    }
  }

  // Recursive sanitization for nested objects
  private sanitizeObject(obj: any, xssFilter: xss.FilterXSS): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        obj[key] = xssFilter.process(obj[key]);
      } else if (Array.isArray(obj[key])) {
        obj[key].forEach((item: any, index: number) => {
          if (typeof item === 'string') {
            obj[key][index] = xssFilter.process(item);
          } else if (item && typeof item === 'object') {
            this.sanitizeObject(item, xssFilter);
          }
        });
      } else if (obj[key] && typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key], xssFilter);
      }
    });
  }

  /**
   * Add trusted headers to the request for microservices to validate
   */
  private addTrustedHeaders(req: Request, payload: any): void {
    // Basic user information
    req.headers['x-user-id'] = payload.sub;
    req.headers['x-user-email'] = payload.email || '';
    req.headers['x-user-roles'] = JSON.stringify(payload.roles || []);

    // Authentication metadata
    req.headers['x-auth-verified'] = 'true';
    req.headers['x-auth-verified-by'] = 'api-gateway';
    req.headers['x-auth-verified-time'] = Date.now().toString();

    // Add request ID for tracing
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;

    // Create HMAC signature to prevent tampering
    const signatureData = {
      userId: payload.sub,
      roles: payload.roles || [],
      timestamp: Date.now(),
      requestId,
    };

    const hmac = crypto.createHmac('sha256', this.gatewaySecret);
    const signature = hmac.update(JSON.stringify(signatureData)).digest('hex');

    // Add signature
    req.headers['x-auth-signature'] = signature;
    req.headers['x-auth-signature-data'] = Buffer.from(JSON.stringify(signatureData)).toString('base64');
  }

  /**
   * Check if this is an internal request from one service to another
   */
  private isInternalServiceRequest(req: Request): boolean {
    // Check for internal service authentication header
    return req.headers['x-service-key'] === this.configService.get('INTERNAL_SERVICE_KEY');
  }

  /**
   * Add headers for service-to-service communication
   */
  private addTrustedServiceHeaders(req: Request): void {
    const serviceId = req.headers['x-service-id'] || 'unknown-service';

    // Create service-to-service trusted headers
    req.headers['x-auth-verified'] = 'true';
    req.headers['x-auth-verified-by'] = 'service';
    req.headers['x-service-communication'] = 'true';
    req.headers['x-auth-verified-time'] = Date.now().toString();

    // Add request ID for tracing if not present
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;

    this.logger.debug(`Internal service request from: ${serviceId} | Request ID: ${requestId}`);
  }
}
