// src/user/repositories/user.repository.ts

import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { User } from '@user/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhoneNumber(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phoneNumber: phone },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}