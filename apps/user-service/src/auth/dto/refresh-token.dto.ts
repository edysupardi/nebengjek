import { IsEmail, IsString } from "class-validator";

export class RefreshTokenDto {
    @IsString()
    access_token: string;
}