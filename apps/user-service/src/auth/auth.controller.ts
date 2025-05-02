// auth.controller.ts
import { Controller, Post, Body, UseGuards, Request, Logger } from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
import { LoginUserDto } from '@user/dto/login-user.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginUserDto) {
    this.logger.log(
      `Login attempt with email: ${loginDto.email}, password: ${loginDto.password}`,
    );
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  async refreshToken(@Request() req: any) {
    const user = req.user;
    // Generate access token baru
    const newAccessToken = this.authService.refreshToken(user);
    this.logger.log(
      `Refresh token for user ID: ${user.userId}, role: ${user.role}`,
    );
    // Simpan refresh token ke Redis/DB
    return { access_token: newAccessToken };
  }
}