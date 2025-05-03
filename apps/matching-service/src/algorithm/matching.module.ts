import { Module } from '@nestjs/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { PrismaModule } from '@app/database/prisma/prisma.module';
import { RedisModule } from '@app/database/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
