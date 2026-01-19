import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Roles } from './roles.decorator';
import { WsRolesGuard } from './ws-roles.guard';

type JoinDatePayload = {
    date: string;
};

@WebSocketGateway({
    namespace: '/realtime',
    cors: { origin: true },
})
export class RealtimeGateway {
    @WebSocketServer()
    server: Server;

    @UseGuards(WsRolesGuard)
    @Roles('manager', 'admin', 'kitchen')
    @SubscribeMessage('joinDate')
    handleJoinDate(
        @MessageBody() payload: JoinDatePayload,
        @ConnectedSocket() client: Socket,
    ) {
        const room = this.getRoomName(payload.date);
        client.join(room);
        return { room, joined: true };
    }

    emitLunchUpdated(date: string, payload: unknown) {
        const room = this.getRoomName(date);
        this.server.to(room).emit('lunch:updated', payload);
    }

    private getRoomName(date: string) {
        return `room:lunch:${date}`;
    }
}

