import { Module } from '@nestjs/common';
import { MatchingModule } from './algorithm/matching.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MatchingModule,
  ],
})
export class AppModule {}