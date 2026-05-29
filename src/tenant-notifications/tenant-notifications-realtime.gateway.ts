import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import {
  tenantNotificationsRoom,
  TenantNotificationsRealtimeService,
} from './tenant-notifications-realtime.service';

@WebSocketGateway({
  namespace: '/tenants/notifications',
  cors: { origin: true, credentials: true },
})
export class TenantNotificationsRealtimeGateway
  implements OnGatewayInit, OnGatewayConnection
{
  private readonly logger = new Logger(TenantNotificationsRealtimeGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantNotificationsRealtime: TenantNotificationsRealtimeService,
  ) {}

  afterInit(): void {
    this.tenantNotificationsRealtime.setNamespace(this.server);
  }

  handleConnection(client: Socket): void {
    void this.authenticateAndJoin(client);
  }

  private async authenticateAndJoin(client: Socket): Promise<void> {
    const rawToken = this.extractToken(client);
    if (!rawToken) {
      this.logger.debug('WS disconnect: missing token');
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(rawToken, {
        issuer: 'real_estate_backend',
        audience: 'rent_pilot',
      });
      if (payload.role !== UserRole.TENANT) {
        this.logger.debug('WS disconnect: not a tenant');
        client.disconnect(true);
        return;
      }
      await client.join(tenantNotificationsRoom(payload.sub));
    } catch {
      this.logger.debug('WS disconnect: invalid token');
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth;
    if (fromAuth && typeof fromAuth === 'object' && 'token' in fromAuth) {
      const t = (fromAuth as { token?: unknown }).token;
      if (typeof t === 'string' && t.trim()) {
        return t.trim();
      }
    }
    const q = client.handshake.query?.token;
    if (typeof q === 'string' && q.trim()) {
      return q.trim();
    }
    if (Array.isArray(q) && typeof q[0] === 'string' && q[0].trim()) {
      return q[0].trim();
    }
    return undefined;
  }
}
