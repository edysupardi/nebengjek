// src/websocket/notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RedisService } from '@app/database/redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);
  private userSocketMap: Map<string, string[]> = new Map();

  @WebSocketServer()
  server: Server;

  constructor(private readonly redisService: RedisService) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Remove client from user-socket mapping
    for (const [userId, sockets] of this.userSocketMap.entries()) {
      const updatedSockets = sockets.filter(socketId => socketId !== client.id);
      if (updatedSockets.length === 0) {
        this.userSocketMap.delete(userId);
      } else {
        this.userSocketMap.set(userId, updatedSockets);
      }
    }
  }

  @SubscribeMessage('register')
  handleRegister(client: Socket, userId: string): void {
    this.logger.log(`User ${userId} registered with socket ${client.id}`);
    
    const existingSockets = this.userSocketMap.get(userId) || [];
    if (!existingSockets.includes(client.id)) {
      this.userSocketMap.set(userId, [...existingSockets, client.id]);
    }
    
    // Join user to a room with their ID for easier targeting
    client.join(`user:${userId}`);
  }

  sendToUser(userId: string, event: string, data: any): void {
    this.logger.log(`Sending ${event} to user ${userId}`);
    this.server.to(`user:${userId}`).emit(event, data);
  }

  sendToDriver(driverId: string, event: string, data: any): void {
    this.sendToUser(driverId, event, data);
  }

  sendToCustomer(customerId: string, event: string, data: any): void {
    this.sendToUser(customerId, event, data);
  }

  broadcastToNearbyDrivers(latitude: number, longitude: number, radiusKm: number, event: string, data: any): void {
    // In a real implementation, this would use geospatial queries in Redis
    // For this mock, we'll just broadcast to all drivers
    this.server.to('drivers').emit(event, data);
  }
}