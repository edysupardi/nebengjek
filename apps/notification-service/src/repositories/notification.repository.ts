// src/repositories/notification.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database/prisma/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(private prisma: PrismaService) {}

  async saveNotification(data: { userId: string; type: string; content: string; isRead: boolean; relatedId?: string }) {
    return this.prisma.notification.create({
      data,
    });
  }

  async getUnreadNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}
