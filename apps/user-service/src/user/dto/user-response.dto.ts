import { UserRole } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { DriverProfileResponseDto } from '@app/user/dto/driver-profile-response.dto';

@Exclude()
export class UserResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the user',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+6281234567890'
  })
  @Expose()
  phone: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe'
  })
  @Expose()
  name: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    nullable: true
  })
  @Expose()
  email: string | null;

  @ApiProperty({
    description: 'User role in the system',
    enum: UserRole,
    example: 'CUSTOMER'
  })
  @Expose()
  role: UserRole;

  @ApiProperty({
    description: 'Timestamp when the user was created',
    example: '2023-01-01T00:00:00Z'
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the user was last updated',
    example: '2023-01-01T00:00:00Z'
  })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Driver profile information if user is a driver',
    type: () => DriverProfileResponseDto,
    required: false
  })
  @Expose()
  @Type(() => DriverProfileResponseDto)
  driverProfile?: DriverProfileResponseDto;
}