import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  port: process.env.TRACKING_WS_PORT || 3060,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class TripGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('TripGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinTrip')
  handleJoinTrip(client: Socket, tripId: string) {
    client.join(`trip:${tripId}`);
    this.logger.log(`Client ${client.id} joined trip: ${tripId}`);
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(client: Socket, tripId: string) {
    client.leave(`trip:${tripId}`);
    this.logger.log(`Client ${client.id} left trip: ${tripId}`);
  }

  sendLocationUpdate(tripId: string, location: any) {
    this.server.to(`trip:${tripId}`).emit('locationUpdate', location);
  }

  sendTripStatusUpdate(tripId: string, status: any) {
    this.server.to(`trip:${tripId}`).emit('tripStatusUpdate', status);
  }
}