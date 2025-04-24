import { Injectable } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  async findByEmail(email: string): Promise<User | undefined> {
    return this.userRepo.findByEmail(email);
  }
}
