// src/notification.controller.ts
import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { NotificationService } from '@app/notification/notification.service';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getUserNotifications(@CurrentUser() user: { id: string }) {
    return this.notificationService.getUserNotifications(user.id);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markNotificationAsRead(id);
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: { id: string }) {
    return this.notificationService.markAllNotificationsAsRead(user.id);
  }
}