import { AuthService } from '@app/auth/auth.service';
import { RegisterUserDto } from '@app/auth/dto/register-user.dto';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { Body, Controller, Logger, Post, UseGuards, Get, Put, Request } from '@nestjs/common';
import { UserResponseDto } from '@app/user/dto/user-response.dto';
import { UpdateUserDto } from '@app/user/dto/update-user.dto';
import { UserService } from '@app/user/user.service';
import { ChangePasswordDto } from '@app/user/dto/change-password.dto';

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterUserDto): Promise<UserResponseDto> {
    this.logger.log(`Registering user with email: ${registerDto.email}`);
    return this.authService.register(registerDto);
  }

  @Get('profile')
  async getProfile(@Request() req: any): Promise<UserResponseDto> {
    this.logger.log(`Fetching profile for user ID: ${req.user.userId}`);
    return this.userService.getProfile(req.user.userId);
  }

  @Put('profile')
  async updateProfile(
    @Request() req: any,
    @Body() updateDto: UpdateUserDto
  ): Promise<UserResponseDto> {
    this.logger.log(`Updating profile for user ID: ${req.user.userId}`);
    return this.userService.updateProfile(req.user.userId, updateDto);
  }

  @Put('password')
  async changePassword(
    @Request() req: any,
    @Body() changePasswordDto: ChangePasswordDto
  ): Promise<UserResponseDto> {
    this.logger.log(`Changing password for user ID: ${req.user.userId}`);
    return this.userService.changePassword(req.user.userId, changePasswordDto);
  }
}
