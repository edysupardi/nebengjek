// libs/database/src/database.module.ts
import { Module, Global } from '@nestjs/common';
import { PrismaService } from '@app/database/prisma/prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}