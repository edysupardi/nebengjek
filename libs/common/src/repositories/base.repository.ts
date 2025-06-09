import { PrismaService } from '@app/database';

export abstract class BaseRepository<T> {
  constructor(protected readonly prisma: PrismaService) {}

  abstract findById(id: string): Promise<T | null>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
}
