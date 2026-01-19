import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const client = context.switchToWs().getClient();
    const role =
      (client.handshake?.auth?.role as string | undefined) ??
      (client.handshake?.headers?.['x-role'] as string | undefined);

    if (!role) {
      throw new WsException(
        new UnauthorizedException('Missing role for websocket connection'),
      );
    }

    if (!requiredRoles.includes(role)) {
      throw new WsException(
        new UnauthorizedException('Role not allowed for this action'),
      );
    }

    client.data = { ...client.data, role };
    return true;
  }
}



