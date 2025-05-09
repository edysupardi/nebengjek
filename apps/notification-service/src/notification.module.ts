// src/notification.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { NotificationController } from '@app/notification/notification.controller';
import { NotificationService } from '@app/notification/notification.service';
import { NotificationRepository } from '@app/notification/repositories/notification.repository';
import { NotificationGateway } from '@app/notification/websocket/notification.gateway';
import { EventsController } from '@app/notification/events/events.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
  ],
  controllers: [NotificationController, EventsController],
  providers: [NotificationService, NotificationRepository, NotificationGateway],
  exports: [NotificationService],
})
export class NotificationModule {}