import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { User } from '@app/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { plainToClass } from 'class-transformer';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterUserDto } from '@app/auth/dto/register-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly userRepository: UserRepository) {}

  async updateProfile(userId: string, updateDto: UpdateUserDto): Promise<UserResponseDto> {
    // If password is being updated, hash it first
    if (updateDto.password) {
      this.logger.log(`Hashing password for user ID: ${userId}`);
      updateDto.password = await bcrypt.hash(updateDto.password, 10);
    }

    const updatedUser = await this.userRepository.update(userId, updateDto);
    if (!updatedUser) {
      this.logger.error(`User not found for ID: ${userId}`);
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User profile updated for ID: ${userId}`);
    return plainToClass(UserResponseDto, updatedUser);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<void> {
    const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

    if (newPassword !== confirmPassword) {
      this.logger.error(`New password and confirmation do not match for user ID: ${userId}`);
      throw new BadRequestException('New password and confirmation do not match');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.error(`User not found for ID: ${userId}`);
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      this.logger.error(`Current password is incorrect for user ID: ${userId}`);
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await this.userRepository.update(userId, { password: hashedPassword });
    if (!updatedUser) {
      this.logger.error(`Failed to update password for user ID: ${userId}`);
      throw new BadRequestException('Failed to update password');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findByPhone(phone);
  }

  async create(registerDto: RegisterUserDto): Promise<UserResponseDto> {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const userData = {
      ...registerDto,
      password: hashedPassword,
    };
    
    const newUser = await this.userRepository.create(userData);
    if (!newUser) {
      this.logger.error(`Failed to create user with email: ${registerDto.email}`);
      throw new BadRequestException('Failed to create user');
    }
    this.logger.log(`User created with email: ${registerDto.email}`);
    return plainToClass(UserResponseDto, newUser);
  }

  async getProfile(userId: number): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(userId.toString());
    if (!user) {
      this.logger.error(`User not found for ID: ${userId}`);
      throw new UnauthorizedException('User not found');
    }
    return plainToClass(UserResponseDto, user);
  }
}
