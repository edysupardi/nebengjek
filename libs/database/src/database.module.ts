// libs/database/src/database.module.ts
import { Module, Global } from '@nestjs/common';
import { PrismaService } from '@app/database/prisma/prisma.service';
import { RedisModule } from '@app/database/redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [PrismaService],
  exports: [PrismaService, RedisModule],
})
export class DatabaseModule {}