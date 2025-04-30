// auth.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
import { LoginUserDto } from '@user/dto/login-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginUserDto) {
    return this.authService.login(loginDto);
  }
}