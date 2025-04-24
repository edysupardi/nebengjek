// src/user/repositories/user.repository.ts

import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UserRepository {
  private users: User[] = [
    {
      id: 'mock-id-1',
      name: 'Edy Supardi',
      email: 'edy@mail.com',
      phone_number: '081234567890',
      password_hash: '$2a$10$xxxx....', // hashed password
      role: 'PASSENGER',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  async findByPhoneNumber(phone: string): Promise<User | undefined> {
    return this.users.find((user) => user.phone_number === phone);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }

  async save(user: User): Promise<User> {
    const newUser = { ...user, id: uuidv4(), created_at: new Date(), updated_at: new Date() };
    this.users.push(newUser);
    return newUser;
  }

  async findById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id);
  }
}