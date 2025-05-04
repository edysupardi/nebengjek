import { forwardRef, Module } from '@nestjs/common';
import { UserService } from '@app/user/user.service';
import { UserController } from '@app/user/user.controller';
import { UserRepository } from '@app/user/repositories/user.repository';
import { AuthModule } from '@app/auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [UserService, UserRepository],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}