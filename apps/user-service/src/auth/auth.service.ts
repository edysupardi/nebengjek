// auth.service.ts
import { ConflictException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UserService } from '@app/user/user.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from '@app/auth/dto/login-user.dto';
import { ConfigService } from '@nestjs/config';
import { LoginResponseDto } from '@app/auth/dto/response-login.dto';
import { RefreshTokenResponseDto } from '@app/auth/dto/response-refresh-token.dto';
import { RegisterUserDto } from '@app/auth/dto/register-user.dto';
import { UserResponseDto } from '@app/user/dto/user-response.dto';
import { UserRole } from '@app/common';
import { plainToClass } from 'class-transformer';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('REDIS_CLIENT') private redis: any, // Inject Redis client
  ) {
    // Cek koneksi Redis
    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });
    this.redis.on('error', (err: any) => {
      this.logger.error('Redis error', err);
    });
  }

  async login(loginDto: LoginUserDto): Promise<LoginResponseDto> {
    const user = await this.userService.findByEmail(loginDto.email);
    if (!user) {
      this.logger.error(`User not found for email: ${loginDto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      this.logger.error(`Invalid password for email: ${loginDto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = {
      sub: user.id,
      role: user.role,
    };

    // Generate access token
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN'),
    });

    // Generate refresh token
    const refreshToken = this.jwtService.sign(
      { ...payload, isRefreshToken: true },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
      },
    );

    await this.redis.set(
      `refresh_token:${user.id}`,
      refreshToken,
      'EX', // Set expiration time
      60 * 60 * 24 * 7, // 7 hari dalam detik (sesuaikan dengan JWT_REFRESH_EXPIRES_IN)
    );

    this.logger.log(`User ${user.id} logged in successfully`);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refreshToken(user: number, refreshToken: string): Promise<RefreshTokenResponseDto> {
    // Verifikasi refresh_token & cek di Redis/DB
    // const payload = this.jwtService.verify(refreshToken, { secret: 'REFRESH_SECRET' });
    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get('JWT_REFRESH_SECRET'), // Pakai env variable
    });
    if (!this.redis) {
      this.logger.error('Redis client is not initialized');
      throw new Error('Redis connection failed');
    }
    const storedToken = await this.redis.get(`refresh_token:${payload.sub}`);

    if (storedToken !== refreshToken) {
      this.logger.error(`Invalid refresh token for user ID: ${payload.sub}`);
      throw new UnauthorizedException();
    }

    this.logger.log(`Generate refresh token for user ID: ${payload.sub}`);
    // Generate access_token baru
    return {
      access_token: this.jwtService.sign({ sub: payload.sub }),
    };
  }

  async register(registerDto: RegisterUserDto): Promise<UserResponseDto> {
    const { email, phone, password, name } = registerDto;

    // Check if user with email already exists
    if (email) {
      const existingUserByEmail = await this.userService.findByEmail(email);
      if (existingUserByEmail) {
        this.logger.error(`Email already registered: ${email}`);
        throw new ConflictException('Email already registered');
      }
    }

    // Check if user with phone already exists
    const existingUserByPhone = await this.userService.findByPhone(phone);
    if (existingUserByPhone) {
      this.logger.error(`Phone number already registered: ${phone}`);
      throw new ConflictException('Phone number already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await this.userService.create({
      ...registerDto,
      password: hashedPassword,
      role: registerDto.role || UserRole.CUSTOMER, // Default to CUSTOMER if not specified
    });

    this.logger.log(`New user registered: ${newUser.id}`);

    // Return user data without password
    return plainToClass(UserResponseDto, newUser);
  }
}
