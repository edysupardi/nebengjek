// apps/user-service/src/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Request, Logger, HttpCode, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@app/auth/auth.service';
import { LoginUserDto } from '@app/auth/dto/login-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { LoginResponseDto } from '@app/auth/dto/response-login.dto';
import { RefreshTokenResponseDto } from '@app/auth/dto/response-refresh-token.dto';
import { RefreshTokenDto } from '@app/auth/dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() loginDto: LoginUserDto): Promise<LoginResponseDto> {
    this.logger.log(
      `Login attempt with email: ${loginDto.email}`,
    );
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt-refresh'))
  async refreshToken(
    @Request() req: any, 
    @Body() refreshDto: RefreshTokenDto
  ): Promise<RefreshTokenResponseDto> {
    try {
      const user = req.user;
      this.logger.log(`Refresh token request for user ID: ${user.userId}`);
      
      // Call the refreshToken method with proper parameters
      return await this.authService.refreshToken(
        user.userId, 
        refreshDto.refresh_token // Use the token from the validated user object
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Refresh token failed: ${errorMessage}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}