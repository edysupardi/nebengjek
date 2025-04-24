import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    JwtModule.register({
      secret: 'NEBENGJEK_SECRET',
      signOptions: { expiresIn: '1d' }, // bisa diganti di env-kan nanti
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}