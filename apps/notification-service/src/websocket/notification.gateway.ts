// src/websocket/notification.gateway.ts
import { RedisService } from '@app/database/redis/redis.service';
import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { firstValueFrom, timeout } from 'rxjs';
import { Server, Socket } from 'socket.io';

interface UserConnection {
  socketId: string;
  userId: string;
  userType: 'customer' | 'driver';
  connectedAt: Date;
  lastPing: Date;
  location?: {
    latitude: number;
    longitude: number;
    updatedAt: Date;
  };
}

interface DriverLocation {
  userId: string;
  socketId: string;
  latitude: number;
  longitude: number;
  updatedAt: Date;
  isOnline: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);
  private userConnections: Map<string, UserConnection[]> = new Map();
  private socketToUser: Map<string, string> = new Map();
  private driverLocations: Map<string, DriverLocation> = new Map(); // Track driver locations

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly redisService: RedisService,
    @Inject('USER_SERVICE') private readonly userServiceClient: ClientProxy,
  ) {
    setInterval(() => this.cleanupStaleConnections(), 300000); // 5 minutes
    setInterval(() => this.syncDriverLocationsToRedis(), 60000); // 1 minute sync to Redis
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id} from ${client.handshake.address}`);

    client.emit('connection_confirmed', {
      socketId: client.id,
      timestamp: new Date(),
      message: 'Connected successfully',
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`Client disconnected: ${client.id}`);

    const userId = this.socketToUser.get(client.id);
    if (userId) {
      this.removeUserConnection(userId, client.id);
      this.socketToUser.delete(client.id);

      // Remove from driver locations if it's a driver
      this.driverLocations.delete(userId);
      // await this.updateDriverLocationInRedis(userId, null); // Mark as offline
    }
  }

  @SubscribeMessage('user.register')
  async handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
    callback?: Function, // <-- Tambahkan callback parameter untuk acknowledgment
  ): Promise<void> {
    try {
      this.logger.log(`🔍 handleRegister called:`, {
        clientExists: !!client,
        clientId: client?.id,
        clientConnected: client?.connected,
        dataExists: !!data,
        hasCallback: !!callback,
        userData: data ? { userId: data.userId, userType: data.userType } : null,
      });

      // Validate client
      if (!client || !client.id || !client.connected) {
        const errorMsg = 'Invalid client connection';
        this.logger.error(`❌ ${errorMsg}:`, { client: !!client, id: client?.id, connected: client?.connected });

        if (callback) callback({ success: false, error: errorMsg });
        if (client?.emit) client.emit('error', { message: errorMsg, errorCode: 'INVALID_CLIENT' });
        return;
      }

      // Validate data
      if (!data || typeof data !== 'object' || !data.userId || !data.userType) {
        const errorMsg = 'Invalid registration data';
        this.logger.error(`❌ ${errorMsg}:`, data);

        if (callback) callback({ success: false, error: errorMsg });
        client.emit('error', { message: errorMsg, errorCode: 'INVALID_DATA' });
        return;
      }

      const { userId, userType, name, email, location, socketId, timestamp, clientInfo } = data;

      // Validate userType
      if (!['customer', 'driver'].includes(userType)) {
        const errorMsg = 'Invalid userType';
        this.logger.error(`❌ ${errorMsg}: ${userType}`);

        if (callback) callback({ success: false, error: errorMsg });
        client.emit('error', { message: errorMsg, errorCode: 'INVALID_USER_TYPE' });
        return;
      }

      this.logger.log(`✅ Processing registration for ${userId} (${userType}) on socket ${client.id}`);

      // Log additional debug info
      if (socketId || timestamp || clientInfo) {
        this.logger.log(`📋 Additional client info:`, {
          frontendSocketId: socketId,
          frontendTimestamp: timestamp,
          clientInfo: clientInfo,
          backendSocketId: client.id,
          socketIdMatch: socketId === client.id,
        });
      }

      // Create connection object
      const connection: UserConnection = {
        socketId: client.id,
        userId,
        userType: userType as 'customer' | 'driver',
        connectedAt: new Date(),
        lastPing: new Date(),
        location:
          location && location.latitude && location.longitude
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                updatedAt: new Date(),
              }
            : undefined,
      };

      // Store connection
      const existingConnections = this.userConnections.get(userId) || [];
      const filteredConnections = existingConnections.filter(conn => conn.socketId !== client.id);
      filteredConnections.push(connection);

      this.userConnections.set(userId, filteredConnections);
      this.socketToUser.set(client.id, userId);

      // Join rooms
      try {
        client.join(`user:${userId}`);
        client.join(`${userType}s`);
        this.logger.log(`📂 Client ${client.id} joined rooms: user:${userId}, ${userType}s`);
      } catch (joinError) {
        this.logger.error('❌ Error joining rooms:', joinError);
      }

      // Handle driver location
      if (userType === 'driver' && location && location.latitude && location.longitude) {
        try {
          this.updateDriverLocation(userId, client.id, location.latitude, location.longitude);
          this.logger.log(`📍 Driver ${userId} registered with location: ${location.latitude}, ${location.longitude}`);
        } catch (locationError) {
          this.logger.error('❌ Error updating driver location:', locationError);
        }
      }

      // **ENHANCED: Prepare comprehensive confirmation data**
      const confirmationData = {
        success: true,
        userId,
        userType,
        timestamp: new Date(),
        activeConnections: filteredConnections.length,
        rooms: [`user:${userId}`, `${userType}s`],
        clientId: client.id,
        serverSocketId: client.id,
        message: `User ${userId} registered successfully as ${userType}`,
      };

      // **MULTIPLE CONFIRMATION STRATEGIES: Send confirmation via multiple methods**

      // 1. Acknowledgment callback (if provided)
      if (callback && typeof callback === 'function') {
        try {
          callback(confirmationData);
          this.logger.log(`✅ Acknowledgment sent to ${userId} via callback`);
        } catch (callbackError) {
          this.logger.error('❌ Error sending acknowledgment callback:', callbackError);
        }
      }

      // 2. Primary confirmation event
      try {
        client.emit('registration_confirmed', confirmationData);
        this.logger.log(`✅ registration_confirmed event sent to ${userId}`);
      } catch (emitError) {
        this.logger.error('❌ Error sending registration_confirmed:', emitError);
      }

      // 3. Alternative confirmation event
      try {
        client.emit('user_registered', {
          success: true,
          userId,
          userType,
          timestamp: new Date(),
          message: `User registered successfully`,
        });
        this.logger.log(`✅ user_registered event sent to ${userId}`);
      } catch (emitError) {
        this.logger.error('❌ Error sending user_registered:', emitError);
      }

      // 4. Dot notation event (some clients might expect this)
      try {
        client.emit('user.registered', {
          success: true,
          userId,
          userType,
          timestamp: new Date(),
        });
        this.logger.log(`✅ user.registered event sent to ${userId}`);
      } catch (emitError) {
        this.logger.error('❌ Error sending user.registered:', emitError);
      }

      // 5. Generic success event
      try {
        client.emit('success', {
          success: true,
          type: 'registration',
          userId,
          userType,
          timestamp: new Date(),
        });
        this.logger.log(`✅ success event sent to ${userId}`);
      } catch (emitError) {
        this.logger.error('❌ Error sending success event:', emitError);
      }

      // 6. Registration acknowledgment event
      try {
        client.emit('registration_ack', {
          success: true,
          userId,
          userType,
          timestamp: new Date(),
        });
        this.logger.log(`✅ registration_ack event sent to ${userId}`);
      } catch (emitError) {
        this.logger.error('❌ Error sending registration_ack:', emitError);
      }

      // Update user status
      try {
        this.updateUserStatus(userId, userType, true);
      } catch (statusError) {
        this.logger.error('❌ Error updating user status:', statusError);
      }

      this.logger.log(
        `✅ User ${userId} (${userType}) successfully registered with ${filteredConnections.length} active connections. Multiple confirmations sent.`,
      );

      if (userType === 'driver') {
        try {
          // Emit driver status ke semua client
          const isOnline = await this.redisService.get(`driver:active:${userId}`);
          this.server.emit('driver.status.broadcast', {
            userId,
            isOnline: Boolean(isOnline),
            latitude: connection.location?.latitude,
            longitude: connection.location?.longitude,
            timestamp: new Date(),
            source: 'registration',
            driverName: name || `Driver ${userId.substring(0, 8)}`,
          });

          // Emit ke room drivers khusus
          this.server.to('drivers').emit('driver.online', {
            userId,
            userType: 'driver',
            name: name || `Driver ${userId.substring(0, 8)}`,
            location: connection.location,
            timestamp: new Date(),
          });

          this.logger.log(`📡 Driver ${userId} status broadcasted: ONLINE`);
        } catch (broadcastError) {
          this.logger.error('❌ Error broadcasting driver status:', broadcastError);
        }
      }
    } catch (error) {
      this.logger.error('🚨 Unexpected error in handleRegister:', error);

      const errorResponse = {
        success: false,
        message: 'Registration failed due to server error',
        errorCode: 'REGISTER_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };

      // Send error via callback if available
      if (callback && typeof callback === 'function') {
        try {
          callback(errorResponse);
        } catch (callbackError) {
          this.logger.error('❌ Error sending error callback:', callbackError);
        }
      }

      // Send error via emit
      try {
        if (client && client.emit) {
          client.emit('error', errorResponse);
        }
      } catch (emitError) {
        this.logger.error('❌ Cannot emit error response:', emitError);
      }
    }
  }

  // **ENHANCED: Add alternative registration method for debugging**
  @SubscribeMessage('register')
  handleRegisterLegacy(@ConnectedSocket() client: Socket, @MessageBody() data: any, callback?: Function): void {
    this.logger.log('📝 Legacy register event received, forwarding to user.register');
    this.handleRegister(client, data, callback);
  }

  @SubscribeMessage('debug.connection')
  handleDebugConnection(@ConnectedSocket() client: Socket, @MessageBody() data?: any, callback?: Function): void {
    try {
      if (!client) {
        const error = { success: false, error: 'No client in debug.connection' };
        if (callback) callback(error);
        return;
      }

      const userId = this.socketToUser.get(client.id);
      const connections = userId ? this.userConnections.get(userId) || [] : [];

      const debugInfo = {
        success: true,
        clientId: client.id,
        userId: userId || 'Not registered',
        connected: client.connected,
        connectionCount: connections.length,
        rooms: Array.from(client.rooms),
        handshake: {
          address: client.handshake.address,
          time: client.handshake.time,
          headers: client.handshake.headers['user-agent'],
        },
        timestamp: new Date(),
        isRegistered: !!userId,
        userType: connections.length > 0 ? connections[0].userType : 'unknown',
      };

      // Send via callback if provided
      if (callback) callback(debugInfo);

      // Send via emit
      client.emit('debug.connection.response', debugInfo);

      this.logger.log(`🔍 Debug info sent to client ${client.id}:`, debugInfo);
    } catch (error) {
      this.logger.error('❌ Error in debug connection:', error);

      const errorResponse = {
        success: false,
        message: 'Debug failed',
        errorCode: 'DEBUG_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      };

      if (callback) callback(errorResponse);
      if (client) {
        client.emit('error', errorResponse);
      }
    }
  }

  // **ENHANCED: Manual re-registration method for recovery**
  @SubscribeMessage('reregister')
  handleReregister(@ConnectedSocket() client: Socket, @MessageBody() data: any, callback?: Function): void {
    try {
      this.logger.log(`🔄 Manual re-registration requested by client ${client?.id}`);

      if (!client) {
        const error = { success: false, error: 'No valid client in reregister' };
        if (callback) callback(error);
        return;
      }

      // Clean up existing registration
      const existingUserId = this.socketToUser.get(client.id);
      if (existingUserId) {
        this.removeUserConnection(existingUserId, client.id);
        this.socketToUser.delete(client.id);
        this.logger.log(`🧹 Cleaned up existing registration for ${existingUserId}`);
      }

      // Proceed with fresh registration
      this.handleRegister(client, data, callback);
    } catch (error) {
      this.logger.error('🚨 Error in handleReregister:', error);
      if (callback) callback({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  @SubscribeMessage('user.register.alt')
  handleRegisterAlternative(@ConnectedSocket() client: Socket, @MessageBody() data: any, callback?: Function): void {
    this.logger.log('🔄 Alternative register method called');

    if (client && data) {
      this.logger.log('✅ Found client and data in alternative method, proceeding...');
      this.handleRegister(client, data, callback);
    } else {
      this.logger.error('❌ Missing client or data in alternative method');
      const error = { success: false, error: 'Missing client or data in alternative method' };

      if (callback) callback(error);
      if (client) {
        client.emit('error', {
          message: 'Missing registration data in alternative method',
          errorCode: 'MISSING_DATA',
        });
      }
    }
  }

  @SubscribeMessage('driver.location.update')
  handleDriverLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { latitude: number; longitude: number },
  ): void {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not registered' });
      return;
    }

    const { latitude, longitude } = data;
    if (!latitude || !longitude) {
      client.emit('error', { message: 'Invalid location data' });
      return;
    }

    this.updateDriverLocation(userId, client.id, latitude, longitude);

    client.emit('driver.location.update.confirmed', {
      success: true,
      latitude,
      longitude,
      timestamp: new Date(),
    });

    this.logger.debug(`Driver ${userId} location updated: ${latitude}, ${longitude}`);
  }

  @SubscribeMessage('driver.status.update')
  async handleDriverStatusUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId: string;
      isOnline: boolean;
      latitude?: number;
      longitude?: number;
      timestamp: string;
    },
  ): Promise<void> {
    try {
      const userId = this.socketToUser.get(client.id);
      if (!userId || userId !== data.userId) {
        client.emit('error', { message: 'Unauthorized status update' });
        return;
      }

      this.logger.log(`🏍️ Driver ${data.userId} status update: ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`);

      // **1. UPDATE REDIS (existing logic)**
      if (data.isOnline && data.latitude && data.longitude) {
        this.updateDriverLocation(userId, client.id, data.latitude, data.longitude);
      } else if (!data.isOnline) {
        this.driverLocations.delete(userId);
        this.updateDriverLocationInRedis(userId, null);
      }

      // **2. NEW: SEND TCP MESSAGE TO USER-SERVICE untuk update database**

      // **3. BROADCAST to all connected clients**
      this.server.emit('driver.status.broadcast', {
        userId: data.userId,
        isOnline: data.isOnline,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: new Date(),
      });

      // **4. CONFIRM to original client**
      client.emit('driver.status.update.confirmed', {
        success: true,
        userId: data.userId,
        isOnline: data.isOnline,
        timestamp: new Date(),
      });

      this.logger.log(`✅ Driver ${data.userId} status update completed`);
    } catch (error) {
      this.logger.error('❌ Error in handleDriverStatusUpdate:', error);
      client.emit('error', {
        message: 'Failed to update driver status',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage('driver.status.register')
  handleDriverStatusRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId: string;
      userType: string;
      email: string;
      name: string;
      isOnline: boolean;
      location?: { latitude: number; longitude: number };
    },
  ): void {
    const userId = this.socketToUser.get(client.id);
    if (!userId || userId !== data.userId) {
      client.emit('error', { message: 'Unauthorized registration' });
      return;
    }

    this.logger.log(`🏍️ Driver ${data.userId} re-registering with status: ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`);

    if (data.isOnline && data.location) {
      this.updateDriverLocation(userId, client.id, data.location.latitude, data.location.longitude);
    } else if (!data.isOnline) {
      this.driverLocations.delete(userId);
      this.updateDriverLocationInRedis(userId, null);
    }

    client.emit('driver.status.register.confirmed', {
      success: true,
      userId: data.userId,
      isOnline: data.isOnline,
      timestamp: new Date(),
      message: `Driver registered as ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`,
    });

    this.logger.log(`✅ Driver ${data.userId} registration confirmed: ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data?: any, callback?: Function): void {
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      this.updateLastPing(userId, client.id);
    }

    const pongResponse = {
      success: true,
      timestamp: new Date(),
      clientId: client.id,
      userId: userId || 'Not registered',
      message: 'Pong received',
    };

    // Send via callback if provided
    if (callback) callback(pongResponse);

    // Send via emit
    client.emit('pong', pongResponse);

    this.logger.debug(`🏓 Ping/Pong with client ${client.id}`);
  }

  @SubscribeMessage('user.connect')
  handleUserConnect(@ConnectedSocket() client: Socket, @MessageBody() data: any, callback?: Function): void {
    this.logger.log('🔗 Alternative connection method received:', data);

    if (data && data.type === 'registration' && data.user) {
      this.logger.log('🔄 Converting user.connect to registration');
      this.handleRegister(client, data.user, callback);
    } else {
      this.logger.warn('❌ Invalid user.connect data format');
      const error = { success: false, error: 'Invalid user.connect format' };

      if (callback) callback(error);
      client.emit('error', {
        message: 'Invalid user.connect format',
        errorCode: 'INVALID_CONNECT_FORMAT',
      });
    }
  }

  @SubscribeMessage('registration.request')
  handleRegistrationRequest(@ConnectedSocket() client: Socket, @MessageBody() data: any, callback?: Function): void {
    this.logger.log('📋 Registration request received:', data);
    this.handleRegister(client, data, callback);
  }

  @SubscribeMessage('get_status')
  handleGetStatus(client: Socket): void {
    const userId = this.socketToUser.get(client.id);
    const connections = userId ? this.userConnections.get(userId) || [] : [];

    client.emit('status_response', {
      connected: !!userId,
      userId,
      connections: connections.length,
      lastPing: connections.find(c => c.socketId === client.id)?.lastPing,
    });
  }

  sendToUser(userId: string, event: string, data: any): boolean {
    const connections = this.userConnections.get(userId);
    if (!connections || connections.length === 0) {
      this.logger.warn(`No active connections for user ${userId}`);
      return false;
    }

    let sentCount = 0;
    connections.forEach(connection => {
      try {
        this.server.to(connection.socketId).emit(event, {
          ...data,
          timestamp: new Date(),
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        });
        sentCount++;
      } catch (error) {
        this.logger.error(`Failed to send to socket ${connection.socketId}:`, error);
      }
    });

    this.logger.debug(`Sent ${event} to user ${userId} (${sentCount}/${connections.length} connections)`);
    return sentCount > 0;
  }

  sendToDriver(driverId: string, event: string, data: any): boolean {
    return this.sendToUser(driverId, event, data);
  }

  sendToCustomer(customerId: string, event: string, data: any): boolean {
    return this.sendToUser(customerId, event, data);
  }

  /**
   * Enhanced broadcast to nearby drivers with actual location filtering
   */
  broadcastToNearbyDrivers(latitude: number, longitude: number, radiusKm: number, event: string, data: any): void {
    return;
  }

  broadcastToAll(event: string, data: any): void {
    this.server.emit(event, {
      ...data,
      timestamp: new Date(),
      messageId: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  /**
   * Simple broadcast to ALL online drivers (tanpa location filtering)
   */
  broadcastToAllDrivers(event: string, data: any): void {
    this.logger.log(`Broadcasting ${event} to all drivers`);

    // Count drivers in 'drivers' room
    const driversRoom = this.server.sockets.adapter.rooms.get('drivers');
    const driverCount = driversRoom ? driversRoom.size : 0;

    if (driverCount === 0) {
      this.logger.warn(`No drivers online to receive broadcast for event: ${event}`);
      return;
    }

    // Broadcast to all drivers room
    this.server.to('drivers').emit(event, {
      ...data,
      timestamp: new Date(),
      messageId: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    this.logger.log(`Broadcast ${event} sent to ${driverCount} online drivers`);
  }

  /**
   * Find drivers within specified radius using Haversine formula
   */
  private findNearbyDrivers(latitude: number, longitude: number, radiusKm: number): DriverLocation[] {
    const nearbyDrivers: DriverLocation[] = [];

    for (const [userId, driverLocation] of this.driverLocations.entries()) {
      if (!driverLocation.isOnline) continue;

      const distance = this.calculateDistance(latitude, longitude, driverLocation.latitude, driverLocation.longitude);

      if (distance <= radiusKm) {
        nearbyDrivers.push(driverLocation);
        this.logger.debug(`Driver ${userId} is ${distance.toFixed(2)}km away`);
      }
    }

    return nearbyDrivers.sort((a, b) => {
      const distA = this.calculateDistance(latitude, longitude, a.latitude, a.longitude);
      const distB = this.calculateDistance(latitude, longitude, b.latitude, b.longitude);
      return distA - distB;
    });
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degreeToRadian(lat2 - lat1);
    const dLon = this.degreeToRadian(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreeToRadian(lat1)) *
        Math.cos(this.degreeToRadian(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private degreeToRadian(degree: number): number {
    return degree * (Math.PI / 180);
  }

  private updateDriverLocation(userId: string, socketId: string, latitude: number, longitude: number): void {
    this.driverLocations.set(userId, {
      userId,
      socketId,
      latitude,
      longitude,
      updatedAt: new Date(),
      isOnline: true,
    });

    // Update connection with location
    const connections = this.userConnections.get(userId);
    if (connections) {
      const connection = connections.find(c => c.socketId === socketId);
      if (connection) {
        connection.location = {
          latitude,
          longitude,
          updatedAt: new Date(),
        };
      }
    }

    // Sync to Redis for other services
    this.updateDriverLocationInRedis(userId, { latitude, longitude });
  }

  private async updateDriverLocationInRedis(
    userId: string,
    location: { latitude: number; longitude: number } | null,
    timestamp?: string,
  ): Promise<void> {
    try {
      const dbUpdateResult = await firstValueFrom(
        this.userServiceClient
          .send('driver.updateStatusWebSocket', {
            userId: userId,
            isOnline: location !== null,
            latitude: location !== null ? location.latitude : null,
            longitude: location !== null ? location.longitude : null,
            timestamp: timestamp || new Date().toISOString(),
            source: 'websocket',
          })
          .pipe(timeout(5000)), // 5 second timeout
      );

      if (dbUpdateResult.success) {
        this.logger.log(`✅ Database updated via TCP for driver ${userId}`);
      } else {
        this.logger.warn(`⚠️ Database update failed via TCP: ${dbUpdateResult.message}`);
      }
    } catch (tcpError) {
      this.logger.error(`❌ TCP call to user-service failed: ${String(tcpError)}`, tcpError);
      // Continue with WebSocket response even if TCP fails
    }
  }

  private async syncDriverLocationsToRedis(): Promise<void> {
    // try {
    //   for (const [userId, location] of this.driverLocations.entries()) {
    //     await this.updateDriverLocationInRedis(userId, {
    //       latitude: location.latitude,
    //       longitude: location.longitude,
    //     });
    //   }
    // } catch (error) {
    //   this.logger.error('Failed to sync driver locations to Redis:', error);
    // }
  }

  private removeUserConnection(userId: string, socketId: string): void {
    const connections = this.userConnections.get(userId);
    if (connections) {
      const filtered = connections.filter(c => c.socketId !== socketId);
      if (filtered.length === 0) {
        this.userConnections.delete(userId);
        this.updateUserStatus(userId, 'customer', false); // Default to customer, could be improved
      } else {
        this.userConnections.set(userId, filtered);
      }
    }
  }

  private updateLastPing(userId: string, socketId: string): void {
    const connections = this.userConnections.get(userId);
    if (connections) {
      const connection = connections.find(c => c.socketId === socketId);
      if (connection) {
        connection.lastPing = new Date();
      }
    }
  }

  private cleanupStaleConnections(): void {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes
    let cleanedCount = 0;

    for (const [userId, connections] of this.userConnections.entries()) {
      const activeConnections = connections.filter(conn => conn.lastPing > staleThreshold);

      if (activeConnections.length !== connections.length) {
        const removedCount = connections.length - activeConnections.length;
        cleanedCount += removedCount;

        if (activeConnections.length === 0) {
          this.userConnections.delete(userId);
          // Remove from driver locations if it's a driver
          this.driverLocations.delete(userId);
          this.updateDriverLocationInRedis(userId, null);
        } else {
          this.userConnections.set(userId, activeConnections);
        }
      }
    }

    // Clean up stale driver locations
    for (const [userId, location] of this.driverLocations.entries()) {
      if (location.updatedAt < staleThreshold) {
        this.driverLocations.delete(userId);
        this.updateDriverLocationInRedis(userId, null);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} stale connections`);
    }
  }

  private async updateUserStatus(userId: string, userType: string, isOnline: boolean): Promise<void> {
    try {
      await this.redisService.set(
        `user_status:${userId}`,
        JSON.stringify({
          userId,
          userType,
          isOnline,
          lastSeen: new Date(),
          connections: this.userConnections.get(userId)?.length || 0,
        }),
        300, // 5 minutes TTL
      );

      if (userType === 'driver') {
        const driverLocation = this.driverLocations.get(userId);

        this.server.emit('driver.status.broadcast', {
          userId,
          isOnline,
          latitude: driverLocation?.latitude,
          longitude: driverLocation?.longitude,
          timestamp: new Date(),
          source: 'status_update',
        });

        this.logger.log(`📡 Driver ${userId} status change broadcasted: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
      }
    } catch (error) {
      this.logger.error('Failed to update user status in Redis:', error);
    }
  }

  getConnectionStats(): {
    totalConnections: number;
    totalUsers: number;
    customerConnections: number;
    driverConnections: number;
    driversWithLocation: number;
    averageConnectionsPerUser: number;
  } {
    let totalConnections = 0;
    let customerConnections = 0;
    let driverConnections = 0;

    for (const connections of this.userConnections.values()) {
      totalConnections += connections.length;
      for (const conn of connections) {
        if (conn.userType === 'customer') customerConnections++;
        else if (conn.userType === 'driver') driverConnections++;
      }
    }

    return {
      totalConnections,
      totalUsers: this.userConnections.size,
      customerConnections,
      driverConnections,
      driversWithLocation: this.driverLocations.size,
      averageConnectionsPerUser: this.userConnections.size > 0 ? totalConnections / this.userConnections.size : 0,
    };
  }

  async getUserStatus(userId: string): Promise<any> {
    try {
      const status = await this.redisService.get(`user_status:${userId}`);
      return status ? JSON.parse(status) : null;
    } catch (error) {
      this.logger.error('Failed to get user status from Redis:', error);
      return null;
    }
  }

  /**
   * Get all nearby drivers for debugging/testing
   */
  getNearbyDrivers(latitude: number, longitude: number, radiusKm: number): any[] {
    return this.findNearbyDrivers(latitude, longitude, radiusKm).map(driver => ({
      userId: driver.userId,
      latitude: driver.latitude,
      longitude: driver.longitude,
      distance: this.calculateDistance(latitude, longitude, driver.latitude, driver.longitude),
      updatedAt: driver.updatedAt,
    }));
  }
}
