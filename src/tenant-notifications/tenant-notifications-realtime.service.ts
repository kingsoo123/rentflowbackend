import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/** Bridges HTTP services to the Socket.IO namespace for tenant notification updates. */
@Injectable()
export class TenantNotificationsRealtimeService {
  private namespace: Namespace | null = null;

  setNamespace(namespace: Namespace): void {
    this.namespace = namespace;
  }

  /** Notify a tenant (all their connected tabs) to refresh notifications / badge. */
  notifyTenant(tenantId: string, payload: { id?: string } = {}): void {
    const room = tenantNotificationsRoom(tenantId);
    this.namespace?.to(room).emit('notifications:updated', payload);
  }

  /** Tell tenant clients to refetch maintenance rows (e.g. manager status change). */
  notifyMaintenanceUpdated(tenantId: string, payload: { id: string }): void {
    const room = tenantNotificationsRoom(tenantId);
    this.namespace?.to(room).emit('maintenance:updated', payload);
  }

  /** Tell tenant clients to refetch service charge lines (manager saved fees for their building). */
  notifyServiceChargesUpdated(tenantId: string): void {
    const room = tenantNotificationsRoom(tenantId);
    this.namespace?.to(room).emit('service-charges:updated', {});
  }
}

export function tenantNotificationsRoom(tenantId: string): string {
  return `tenant-notifications:${tenantId}`;
}
