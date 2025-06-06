import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  // Phone number cannot be changed easily for security reasons
  // Should require verification process
}
