import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { WsRolesGuard } from './ws-roles.guard';

@Module({
  providers: [RealtimeGateway, WsRolesGuard],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}

