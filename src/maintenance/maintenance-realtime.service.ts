import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/** Bridges HTTP services to the Socket.IO namespace for manager maintenance updates. */
@Injectable()
export class MaintenanceRealtimeService {
  private namespace: Namespace | null = null;

  setNamespace(namespace: Namespace): void {
    this.namespace = namespace;
  }

  /** Notify subscribed property managers that a tenant created a new request. */
  notifyMaintenanceCreated(payload: { id: string }): void {
    this.namespace?.to('managers-maintenance').emit('maintenance:created', payload);
  }
}
