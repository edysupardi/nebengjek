import { Injectable } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { User } from '@app/common';

@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findByEmail(email);
  }
}
