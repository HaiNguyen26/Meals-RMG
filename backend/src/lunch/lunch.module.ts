import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { LunchController } from './lunch.controller';
import { LunchService } from './lunch.service';

@Module({
    imports: [AuthModule, RealtimeModule],
    controllers: [LunchController],
    providers: [LunchService],
})
export class LunchModule { }

