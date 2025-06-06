import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { DriverProfile } from '@app/common/entities';

@Injectable()
export class DriverProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Partial<DriverProfile>): Promise<DriverProfile> {
    return this.prisma.driverProfile.create({
      data: data as any,
    });
  }

  async findById(id: string): Promise<DriverProfile | null> {
    return this.prisma.driverProfile.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
  }

  async findByUserId(userId: string): Promise<DriverProfile | null> {
    return this.prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });
  }

  async update(id: string, data: Partial<DriverProfile>): Promise<DriverProfile> {
    return this.prisma.driverProfile.update({
      where: { id },
      data: data as any,
    });
  }

  async updateStatus(userId: string, status: boolean): Promise<DriverProfile> {
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { status },
    });
  }

  async findActiveDrivers(): Promise<DriverProfile[]> {
    return this.prisma.driverProfile.findMany({
      where: { status: true },
      include: { user: true },
    });
  }
}
