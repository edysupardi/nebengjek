import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterDriverDto {
  @IsString()
  @IsNotEmpty()
  vehicleType: string;

  @IsString()
  @IsNotEmpty()
  plateNumber: string;
}
