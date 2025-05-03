import { IsString, IsEmail, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(10)
  @MaxLength(15)
  @Matches(/^(\+62|62|0)[8][1-9][0-9]{6,9}$/, {
    message: 'Phone number must be valid Indonesian number'
  })
  phone?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  @MaxLength(50)
  password?: string;

  // Note: role cannot be updated through this endpoint for security
  // Only admin should be able to change user roles
}