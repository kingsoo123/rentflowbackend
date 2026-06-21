import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

export function managerMessagesRoom(managerUserId: string): string {
  return `manager:${managerUserId}`;
}

export function tenantMessagesRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

@Injectable()
export class DirectMessagesRealtimeService {
  private managerNamespace: Namespace | null = null;
  private tenantNamespace: Namespace | null = null;

  setManagerNamespace(namespace: Namespace): void {
    this.managerNamespace = namespace;
  }

  setTenantNamespace(namespace: Namespace): void {
    this.tenantNamespace = namespace;
  }

  notifyMessageCreated(payload: {
    threadId: string;
    messageId: string;
    managerUserId: string;
    tenantId: string;
  }): void {
    const eventPayload = {
      threadId: payload.threadId,
      messageId: payload.messageId,
      tenantId: payload.tenantId,
    };
    if (this.managerNamespace) {
      this.managerNamespace
        .to(managerMessagesRoom(payload.managerUserId))
        .emit('direct-message:created', eventPayload);
    }
    if (this.tenantNamespace) {
      this.tenantNamespace
        .to(tenantMessagesRoom(payload.tenantId))
        .emit('direct-message:created', eventPayload);
    }
  }
}
