import { Module } from '@nestjs/common';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { UserRepository } from './repositories/user.repository';

@Module({
  providers: [UsersService, UserRepository],
  controllers: [UsersController],
  exports: [UsersService], // Supaya bisa digunakan di AuthModule
})
export class UserModule {}