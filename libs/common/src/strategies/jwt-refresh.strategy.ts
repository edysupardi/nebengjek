// apps/user-service/src/auth/jwt-refresh.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refresh_token'), // Ambil dari body
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret',
      passReqToCallback: true, // Untuk mendapatkan akses ke request
    });
  }

  async validate(req: Request, payload: any) {
    const refreshToken = req.body.refresh_token;

    // Validasi format payload
    if (!payload.isRefreshToken) {
      throw new Error('Invalid token type');
    }

    return {
      userId: payload.sub,
      role: payload.role,
      refreshToken: refreshToken, // Pass the actual token for verification in service
    };
  }
}
