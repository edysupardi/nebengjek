import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { DriverProfile, User } from '@app/common/entities';
import { User as PrismaUser, Prisma } from '@prisma/client';

type UserWithRelations = PrismaUser & {
  driverProfile?: DriverProfile | null;
};

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserWithRelations | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        driverProfile: true,
      },
    });

    if (!user) return null;

    // Transform null menjadi undefined
    return {
      ...user,
      email: user.email ?? undefined,
    } as UserWithRelations;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        driverProfile: true,
      },
    });

    if (!user) return null;

    return {
      ...user,
      email: user.email ?? undefined,
    } as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    const user = await this.prisma.user.create({
      data,
      include: {
        driverProfile: true,
      },
    });

    return {
      ...user,
      email: user.email ?? undefined,
    } as User;
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        driverProfile: true,
      },
    });

    return {
      ...user,
      email: user.email ?? undefined,
    } as User;
  }
}
