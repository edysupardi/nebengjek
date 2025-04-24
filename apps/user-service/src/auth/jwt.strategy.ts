import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'NEBENGJEK_SECRET', // bisa di ganti di ENV ya
    });
  }

  async validate(payload: any) {
    // Payload ini adalah yang kamu masukkan saat sign di auth.service.ts
    // Misalnya: { sub: user.id, role: user.role }
    return { userId: payload.sub, role: payload.role };
  }
}