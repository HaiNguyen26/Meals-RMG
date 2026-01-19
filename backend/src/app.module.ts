import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LunchModule } from './lunch/lunch.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, LunchModule, RealtimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
