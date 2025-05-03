import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`, // atau bisa parameter `.env.user`, `.env.booking`, dll
    }),
  ],
})
export class CommonConfigModule {}