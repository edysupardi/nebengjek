// libs/database/src/redis/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;

  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {
    // Konfigurasi Redis untuk publisher dan subscriber
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
  }

  async onModuleInit() {
    // Cek koneksi Redis
    try {
      await this.client.ping();
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection error:', error);
    }
  }

  async onModuleDestroy() {
    await this.publisher.quit();
    await this.subscriber.quit();
    // Client akan ditutup oleh modul
  }

  // Operasi dasar Redis
  async set(key: string, value: any, ttl?: number): Promise<'OK'> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      return this.client.set(key, stringValue, 'EX', ttl);
    }
    return this.client.set(key, stringValue);
  }

  async get(key: string): Promise<any> {
    const value = await this.client.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  // Operasi untuk lokasi driver
  async setDriverLocation(driverId: string, latitude: number, longitude: number): Promise<'OK'> {
    const key = `driver:${driverId}:location`;
    const location = { latitude, longitude, timestamp: Date.now() };
    return this.set(key, location, 300); // TTL 5 menit
  }

  async getDriverLocation(
    driverId: string,
  ): Promise<{ latitude: number; longitude: number; timestamp: number } | null> {
    const key = `driver:${driverId}:location`;
    return this.get(key);
  }

  async setDriverOnline(driverId: string, status: boolean): Promise<'OK'> {
    const key = `driver:${driverId}:online`;
    return this.set(key, status);
  }

  async isDriverOnline(driverId: string): Promise<boolean> {
    const key = `driver:${driverId}:online`;
    const status = await this.get(key);
    return status === true;
  }

  // Pub/Sub untuk notifikasi
  async publish(channel: string, message: any): Promise<number> {
    const stringMessage = typeof message === 'string' ? message : JSON.stringify(message);
    return this.publisher.publish(channel, stringMessage);
  }

  subscribe(channel: string, callback: (message: string) => void): void {
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  unsubscribe(channel: string): void {
    this.subscriber.unsubscribe(channel);
  }

  getClient(): Redis {
    return this.client;
  }
}
