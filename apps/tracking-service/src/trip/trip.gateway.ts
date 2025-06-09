// Enhanced trip.gateway.ts
import { forwardRef, Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TripService } from './trip.service';

interface TripConnection {
  socketId: string;
  userId: string;
  userType: 'driver' | 'customer';
  tripId?: string;
  connectedAt: Date;
  lastPing: Date;
}

interface AutoUpdateSession {
  tripId: string;
  driverId: string;
  socketId: string;
  intervalMs: number;
  intervalRef: NodeJS.Timeout;
  isActive: boolean;
  startedAt: Date;
}

@WebSocketGateway({
  port: process.env.TRACKING_WS_PORT || 3060,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class TripGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('TripGateway');

  // Connection management
  private tripConnections: Map<string, TripConnection[]> = new Map(); // userId -> connections
  private socketToUser: Map<string, string> = new Map(); // socketId -> userId

  // Auto update sessions
  private autoUpdateSessions: Map<string, AutoUpdateSession> = new Map(); // tripId -> session

  constructor(@Inject(forwardRef(() => TripService)) private readonly tripService: TripService) {
    // Cleanup stale sessions every 5 minutes
    setInterval(() => this.cleanupStaleSessions(), 300000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    client.emit('connection_confirmed', {
      socketId: client.id,
      timestamp: new Date(),
      message: 'Connected to Trip Tracking WebSocket',
      service: 'tracking-service',
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    const userId = this.socketToUser.get(client.id);
    if (userId) {
      this.removeUserConnection(userId, client.id);
      this.socketToUser.delete(client.id);

      // Stop any auto update sessions for this user
      this.stopAutoUpdatesBySocket(client.id);
    }
  }

  // ============= USER REGISTRATION =============

  @SubscribeMessage('trip.user.register')
  handleTripUserRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId: string;
      userType: 'driver' | 'customer';
      tripId?: string;
    },
    callback?: Function,
  ): void {
    try {
      this.logger.log(`Trip user registration: ${data.userId} (${data.userType})`);

      if (!data.userId || !data.userType) {
        const error = { success: false, error: 'Missing userId or userType' };
        if (callback) callback(error);
        client.emit('error', error);
        return;
      }

      const connection: TripConnection = {
        socketId: client.id,
        userId: data.userId,
        userType: data.userType,
        tripId: data.tripId,
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      // Store connection
      const existingConnections = this.tripConnections.get(data.userId) || [];
      const filteredConnections = existingConnections.filter(conn => conn.socketId !== client.id);
      filteredConnections.push(connection);

      this.tripConnections.set(data.userId, filteredConnections);
      this.socketToUser.set(client.id, data.userId);

      // Join user room
      client.join(`trip_user:${data.userId}`);
      if (data.tripId) {
        client.join(`trip:${data.tripId}`);
      }

      const confirmationData = {
        success: true,
        userId: data.userId,
        userType: data.userType,
        tripId: data.tripId,
        socketId: client.id,
        timestamp: new Date(),
        message: 'Registered for trip tracking',
      };

      if (callback) callback(confirmationData);
      client.emit('trip.user.registered', confirmationData);

      this.logger.log(`✅ Trip user ${data.userId} registered successfully`);
    } catch (error) {
      this.logger.error('Error in trip user registration:', error);
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
      if (callback) callback(errorResponse);
      client.emit('error', errorResponse);
    }
  }

  // ============= TRIP ROOM MANAGEMENT =============

  @SubscribeMessage('joinTrip')
  handleJoinTrip(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string | { tripId: string },
    callback?: Function,
  ) {
    const tripId = typeof data === 'string' ? data : data.tripId;

    client.join(`trip:${tripId}`);
    this.logger.log(`Client ${client.id} joined trip: ${tripId}`);

    const response = { success: true, tripId, message: `Joined trip ${tripId}` };
    if (callback) callback(response);
    client.emit('trip.joined', response);
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string | { tripId: string },
    callback?: Function,
  ) {
    const tripId = typeof data === 'string' ? data : data.tripId;

    client.leave(`trip:${tripId}`);
    this.logger.log(`Client ${client.id} left trip: ${tripId}`);

    const response = { success: true, tripId, message: `Left trip ${tripId}` };
    if (callback) callback(response);
    client.emit('trip.left', response);
  }

  // ============= AUTO LOCATION UPDATES =============

  @SubscribeMessage('trip.start_auto_location')
  handleStartAutoLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      tripId: string;
      intervalMs?: number;
    },
    callback?: Function,
  ): void {
    try {
      const userId = this.socketToUser.get(client.id);
      if (!userId) {
        const error = { success: false, error: 'User not registered' };
        if (callback) callback(error);
        client.emit('error', error);
        return;
      }

      const { tripId, intervalMs = 10000 } = data;

      this.logger.log(`🛣️ Starting auto location for trip ${tripId} by ${userId}`);

      // Stop existing session if any
      if (this.autoUpdateSessions.has(tripId)) {
        this.stopAutoLocationUpdate(tripId);
      }

      // Create new auto update session
      const intervalRef = setInterval(() => {
        this.requestLocationFromDriver(tripId, userId, client.id);
      }, intervalMs);

      const session: AutoUpdateSession = {
        tripId,
        driverId: userId,
        socketId: client.id,
        intervalMs,
        intervalRef,
        isActive: true,
        startedAt: new Date(),
      };

      this.autoUpdateSessions.set(tripId, session);

      const response = {
        success: true,
        tripId,
        intervalMs,
        message: `Auto location updates started for trip ${tripId}`,
        sessionId: `${tripId}_${Date.now()}`,
      };

      if (callback) callback(response);
      client.emit('trip.auto_location.started', response);

      this.logger.log(`✅ Auto location started for trip ${tripId}, interval: ${intervalMs}ms`);
    } catch (error) {
      this.logger.error('Error starting auto location:', error);
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start auto location',
      };
      if (callback) callback(errorResponse);
      client.emit('error', errorResponse);
    }
  }

  @SubscribeMessage('trip.stop_auto_location')
  handleStopAutoLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string },
    callback?: Function,
  ): void {
    try {
      const { tripId } = data;
      const stopped = this.stopAutoLocationUpdate(tripId);

      const response = {
        success: stopped,
        tripId,
        message: stopped ? 'Auto location updates stopped' : 'No active session found',
      };

      if (callback) callback(response);
      client.emit('trip.auto_location.stopped', response);
    } catch (error) {
      this.logger.error('Error stopping auto location:', error);
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop auto location',
      };
      if (callback) callback(errorResponse);
    }
  }

  // ============= MANUAL LOCATION UPDATES =============

  @SubscribeMessage('trip.update_location')
  async handleUpdateLocationWS(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      tripId: string;
      latitude: number;
      longitude: number;
      isAutoUpdate?: boolean;
    },
    callback?: Function,
  ): Promise<void> {
    try {
      const userId = this.socketToUser.get(client.id);
      if (!userId) {
        const error = { success: false, error: 'User not registered' };
        if (callback) callback(error);
        client.emit('error', error);
        return;
      }

      const { tripId, latitude, longitude, isAutoUpdate = false } = data;

      // **HYBRID: Call the same service method used by HTTP endpoint**
      const result = await this.tripService.updateTripLocation(tripId, userId, {
        latitude,
        longitude,
      });

      // Send WebSocket-specific response
      const response = {
        success: true,
        tripId,
        latitude,
        longitude,
        isAutoUpdate,
        timestamp: new Date(),
        result: {
          distance: result.distance,
          cost: result.cost,
        },
      };

      if (callback) callback(response);
      client.emit('trip.location.updated', response);

      // Broadcast to all trip participants (customers, other drivers, etc.)
      this.broadcastLocationUpdate(tripId, {
        driverId: userId,
        latitude,
        longitude,
        isAutoUpdate,
        distance: result.distance,
        cost: result.cost,
        timestamp: new Date(),
      });

      if (!isAutoUpdate) {
        this.logger.log(`📍 Manual location update: Trip ${tripId} at ${latitude}, ${longitude}`);
      }
    } catch (error) {
      this.logger.error('Error updating location via WebSocket:', error);
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Location update failed',
      };
      if (callback) callback(errorResponse);
      client.emit('error', errorResponse);
    }
  }

  @SubscribeMessage('trip.location.response')
  handleLocationResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      tripId: string;
      latitude: number;
      longitude: number;
      requestId?: string;
    },
  ): void {
    // Handle driver's response to location request
    this.handleUpdateLocationWS(client, {
      ...data,
      isAutoUpdate: true,
    });
  }

  // ============= MANUAL METHODS CALLED BY HTTP OR SERVICE =============

  sendLocationUpdate(tripId: string, data: any) {
    this.server.to(`trip:${tripId}`).emit('locationUpdate', {
      ...data,
      timestamp: new Date(),
      source: 'http', // Indicate this came from HTTP endpoint
    });
  }

  sendTripStatusUpdate(tripId: string, data: any) {
    this.server.to(`trip:${tripId}`).emit('tripStatusUpdate', {
      ...data,
      timestamp: new Date(),
      source: 'http',
    });
  }

  // ============= PRIVATE HELPER METHODS =============

  private requestLocationFromDriver(tripId: string, driverId: string, socketId: string): void {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    this.server.to(socketId).emit('trip.location.request', {
      tripId,
      driverId,
      requestId,
      timestamp: new Date(),
      message: 'Please provide current location for auto-update',
    });

    this.logger.debug(`📡 Location request sent to driver ${driverId} for trip ${tripId}`);
  }

  private broadcastLocationUpdate(tripId: string, data: any): void {
    this.server.to(`trip:${tripId}`).emit('trip.location.broadcast', {
      ...data,
      messageId: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  private stopAutoLocationUpdate(tripId: string): boolean {
    const session = this.autoUpdateSessions.get(tripId);
    if (session) {
      clearInterval(session.intervalRef);
      this.autoUpdateSessions.delete(tripId);
      this.logger.log(`🛑 Auto location stopped for trip ${tripId}`);
      return true;
    }
    return false;
  }

  private stopAutoUpdatesBySocket(socketId: string): void {
    for (const [tripId, session] of this.autoUpdateSessions.entries()) {
      if (session.socketId === socketId) {
        this.stopAutoLocationUpdate(tripId);
      }
    }
  }

  private removeUserConnection(userId: string, socketId: string): void {
    const connections = this.tripConnections.get(userId);
    if (connections) {
      const filtered = connections.filter(c => c.socketId !== socketId);
      if (filtered.length === 0) {
        this.tripConnections.delete(userId);
      } else {
        this.tripConnections.set(userId, filtered);
      }
    }
  }

  private cleanupStaleSessions(): void {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
    let cleanedCount = 0;

    for (const [tripId, session] of this.autoUpdateSessions.entries()) {
      if (session.startedAt < staleThreshold && !session.isActive) {
        this.stopAutoLocationUpdate(tripId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`🧹 Cleaned up ${cleanedCount} stale auto-update sessions`);
    }
  }

  // ============= PUBLIC UTILITY METHODS =============

  getActiveAutoUpdateSessions(): { tripId: string; driverId: string; intervalMs: number; startedAt: Date }[] {
    return Array.from(this.autoUpdateSessions.values()).map(session => ({
      tripId: session.tripId,
      driverId: session.driverId,
      intervalMs: session.intervalMs,
      startedAt: session.startedAt,
    }));
  }

  getConnectionStats(): {
    totalConnections: number;
    totalUsers: number;
    activeAutoSessions: number;
  } {
    let totalConnections = 0;
    for (const connections of this.tripConnections.values()) {
      totalConnections += connections.length;
    }

    return {
      totalConnections,
      totalUsers: this.tripConnections.size,
      activeAutoSessions: this.autoUpdateSessions.size,
    };
  }
}
