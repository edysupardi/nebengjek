// src/notification.controller.ts
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { TrustedGatewayGuard } from '@app/common/guards/trusted-gateway.guard';
import { NotificationService } from '@app/notification/notification.service';
import { Controller, Get, Logger, Param, Patch, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { NotificationGateway } from './websocket/notification.gateway';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Get()
  @UseGuards(TrustedGatewayGuard)
  async getUserNotifications(@CurrentUser() user: { id: string }) {
    return this.notificationService.getUserNotifications(user.id);
  }

  @Patch(':id/read')
  @UseGuards(TrustedGatewayGuard)
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markNotificationAsRead(id);
  }

  @Patch('read-all')
  @UseGuards(TrustedGatewayGuard)
  async markAllAsRead(@CurrentUser() user: { id: string }) {
    return this.notificationService.markAllNotificationsAsRead(user.id);
  }

  @MessagePattern('sendToDriver')
  async sendToDriver(data: { driverId: string; event: string; data: any }) {
    try {
      this.logger.log(`[TCP] Sending ${data.event} to driver ${data.driverId}`);

      const success = this.notificationGateway.sendToDriver(data.driverId, data.event, data.data);

      return {
        success: success,
        message: success ? `Notification sent to driver ${data.driverId}` : `Driver ${data.driverId} not connected`,
        driverId: data.driverId,
        event: data.event,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error sending notification to driver ${data.driverId}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        driverId: data.driverId,
        event: data.event,
      };
    }
  }

  @MessagePattern('sendToCustomer')
  async sendToCustomer(data: { customerId: string; event: string; data: any }) {
    try {
      this.logger.log(`[TCP] Sending ${data.event} to customer ${data.customerId}`);

      const success = this.notificationGateway.sendToCustomer(data.customerId, data.event, data.data);

      return {
        success: success,
        message: success
          ? `Notification sent to customer ${data.customerId}`
          : `Customer ${data.customerId} not connected`,
        customerId: data.customerId,
        event: data.event,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error sending notification to customer ${data.customerId}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        customerId: data.customerId,
        event: data.event,
      };
    }
  }

  @MessagePattern('broadcastToNearbyDrivers')
  async broadcastToNearbyDrivers(data: {
    latitude: number;
    longitude: number;
    radius: number;
    event: string;
    data: any;
  }) {
    try {
      this.logger.log(
        `[TCP] Broadcasting ${data.event} to drivers within ${data.radius}km of ${data.latitude}, ${data.longitude}`,
      );

      this.notificationGateway.broadcastToNearbyDrivers(
        data.latitude,
        data.longitude,
        data.radius,
        data.event,
        data.data,
      );

      return {
        success: true,
        message: `Broadcast sent to nearby drivers`,
        location: { latitude: data.latitude, longitude: data.longitude },
        radius: data.radius,
        event: data.event,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error broadcasting to nearby drivers:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        event: data.event,
      };
    }
  }

  @MessagePattern('broadcastToAllDrivers')
  async broadcastToAllDrivers(data: { event: string; data: any }) {
    try {
      this.logger.log(`[TCP] Broadcasting ${data.event} to all drivers`);

      this.notificationGateway.broadcastToAllDrivers(data.event, data.data);

      return {
        success: true,
        message: `Broadcast sent to all drivers`,
        event: data.event,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error broadcasting to all drivers:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        event: data.event,
      };
    }
  }

  @MessagePattern('getConnectionStats')
  async getConnectionStats() {
    try {
      this.logger.log(`[TCP] Getting connection statistics`);

      const stats = this.notificationGateway.getConnectionStats();

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error getting connection stats:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        data: {},
      };
    }
  }

  @MessagePattern('checkUserConnection')
  async checkUserConnection(data: { userId: string; userType: 'customer' | 'driver' }) {
    try {
      this.logger.log(`[TCP] Checking connection for ${data.userType} ${data.userId}`);

      // Check if user is connected by trying to get their status
      const userStatus = await this.notificationGateway.getUserStatus(data.userId);
      const isConnected = userStatus && userStatus.isOnline;

      return {
        success: true,
        data: {
          userId: data.userId,
          userType: data.userType,
          isConnected: isConnected,
          connectionDetails: userStatus,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error checking user connection:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        data: {
          userId: data.userId,
          userType: data.userType,
          isConnected: false,
        },
      };
    }
  }

  @MessagePattern('sendBulkNotifications')
  async sendBulkNotifications(data: {
    notifications: Array<{
      userId: string;
      userType: 'customer' | 'driver';
      event: string;
      data: any;
    }>;
  }) {
    try {
      this.logger.log(`[TCP] Sending ${data.notifications.length} bulk notifications`);

      const results = [];

      for (const notification of data.notifications) {
        try {
          let success = false;

          if (notification.userType === 'driver') {
            success = this.notificationGateway.sendToDriver(notification.userId, notification.event, notification.data);
          } else if (notification.userType === 'customer') {
            success = this.notificationGateway.sendToCustomer(
              notification.userId,
              notification.event,
              notification.data,
            );
          }

          results.push({
            userId: notification.userId,
            userType: notification.userType,
            event: notification.event,
            success: success,
          });
        } catch (error) {
          results.push({
            userId: notification.userId,
            userType: notification.userType,
            event: notification.event,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      return {
        success: true,
        message: `Sent ${successCount}/${data.notifications.length} notifications successfully`,
        data: {
          total: data.notifications.length,
          successful: successCount,
          failed: data.notifications.length - successCount,
          results: results,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[TCP] Error sending bulk notifications:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        data: {
          total: data.notifications.length,
          successful: 0,
          failed: data.notifications.length,
        },
      };
    }
  }
}
