import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CommonConfigService {
  constructor(private configService: ConfigService) {}

  get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET') ?? 'default_jwt_secret';
  }

  get dbUrl(): string {
    return this.configService.get<string>('DATABASE_URL') ?? 'default_database_url';
  }

  // Tambahkan sesuai kebutuhan lain
}
