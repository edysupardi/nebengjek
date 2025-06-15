// libs/common/src/guards/trusted-gateway.guard.ts
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { Observable } from 'rxjs';

@Injectable()
export class TrustedGatewayGuard implements CanActivate {
  private readonly logger = new Logger(TrustedGatewayGuard.name);
  private gatewaySecret: string;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    this.gatewaySecret = this.configService.get('GATEWAY_SECRET_KEY') || '';
    if (!this.gatewaySecret) {
      this.logger.warn('GATEWAY_SECRET_KEY not set - security compromised!');
    }
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();

    // Check if route is marked as public with @Public() decorator
    const isPublic =
      this.reflector.get<boolean>('isPublic', context.getHandler()) ||
      this.reflector.get<boolean>('isPublic', context.getClass());

    if (isPublic) {
      return true;
    }

    // Check if this is direct service-to-service communication
    if (req.headers['x-service-communication'] === 'true') {
      // For service-to-service, we trust the internal service key
      const internalServiceKey = req.headers['x-service-key'];
      if (internalServiceKey !== this.configService.get('INTERNAL_SERVICE_KEY')) {
        this.logger.warn('Unauthorized internal service request');
        throw new UnauthorizedException('Invalid service credentials');
      }

      return true;
    }

    // Normal API Gateway authentication flow

    // Check gateway verification headers
    if (req.headers['x-auth-verified'] !== 'true' || req.headers['x-auth-verified-by'] !== 'api-gateway') {
      this.logger.warn('Request not verified by API Gateway');
      throw new UnauthorizedException('Request not authenticated by API Gateway');
    }

    // Verify signature if gateway secret is set
    if (this.gatewaySecret) {
      try {
        this.verifySignature(req);
      } catch (error) {
        this.logger.warn(`Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw new UnauthorizedException('Invalid authentication signature');
      }
    }

    // Get user info from headers
    const userId = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    const userRolesStr = req.headers['x-user-roles'] || '[]';
    let userRoles = [];

    try {
      userRoles = JSON.parse(userRolesStr);
    } catch (e) {
      this.logger.warn('Failed to parse user roles from header');
    }

    // Check required roles if any
    const requiredRoles =
      this.reflector.get<string[]>('roles', context.getHandler()) ||
      this.reflector.get<string[]>('roles', context.getClass());

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some(role => userRoles.includes(role));
      if (!hasRole) {
        this.logger.warn(`User ${userId} lacks required roles: ${requiredRoles.join(', ')}`);
        throw new UnauthorizedException('Insufficient permissions');
      }
    }

    // Add user object to request
    req.user = {
      sub: userId, // Use 'sub' for compatibility with JWT standards
      userId: userId, // Custom user ID field
      email: userEmail,
      roles: userRoles,
    };

    return true;
  }

  /**
   * Verify the HMAC signature to ensure the headers weren't tampered with
   */
  private verifySignature(req: any): void {
    const signature = req.headers['x-auth-signature'];
    const signatureDataBase64 = req.headers['x-auth-signature-data'];

    if (!signature || !signatureDataBase64) {
      throw new Error('Authentication signature missing');
    }

    try {
      // Decode the signature data
      const signatureDataJson = Buffer.from(signatureDataBase64, 'base64').toString();
      const signatureData = JSON.parse(signatureDataJson);

      // Verify timestamp is recent (within 5 minutes)
      const timestamp = signatureData.timestamp;
      const now = Date.now();
      if (now - timestamp > 5 * 60 * 1000) {
        throw new Error('Authentication signature expired');
      }

      // Calculate expected signature
      const hmac = crypto.createHmac('sha256', this.gatewaySecret);
      const expectedSignature = hmac.update(signatureDataJson).digest('hex');

      // Compare signatures
      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }
    } catch (error) {
      throw new Error(`Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
