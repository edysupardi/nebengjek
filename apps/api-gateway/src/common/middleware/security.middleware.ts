import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import * as xss from 'xss-clean';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private helmetMiddleware;
  private xssMiddleware;
  
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService
  ) {
    this.helmetMiddleware = helmet();
    this.xssMiddleware = xss();
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Apply security middlewares
    this.helmetMiddleware(req, res, () => {
      this.xssMiddleware(req, res, () => {
        // Set security headers
        res.setHeader('Content-Security-Policy', "default-src 'self'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Check public routes
        const publicRoutes = ['/api/auth/login', '/api/auth/register', '/api/health'];
        if (publicRoutes.includes(req.path)) {
          return next();
        }
        
        // JWT verification for protected routes
        const token = this.extractTokenFromHeader(req);
        if (!token) {
          return res.status(401).json({ message: 'Unauthorized' });
        }
        
        try {
          const payload = this.jwtService.verify(token, {
            secret: this.configService.get('JWT_ACCESS_SECRET')
          });
          req.user = payload;
          next();
        } catch (error) {
          return res.status(401).json({ message: 'Invalid token' });
        }
      });
    });
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}