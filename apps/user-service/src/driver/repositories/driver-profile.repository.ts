import { DriverProfile } from '@app/common/entities';
import { PrismaService } from '@app/database';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DriverProfileRepository {
  /* eslint-disable no-unused-vars */
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

  async findMany(params: { where: any; include?: any }) {
    return this.prisma.driverProfile.findMany(params);
  }
}
