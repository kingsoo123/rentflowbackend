import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

export function managerMessagesRoom(managerUserId: string): string {
  return `manager:${managerUserId}`;
}

export function tenantMessagesRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function artisanMessagesRoom(artisanUserId: string): string {
  return `artisan:${artisanUserId}`;
}

@Injectable()
export class DirectMessagesRealtimeService {
  private managerNamespace: Namespace | null = null;
  private tenantNamespace: Namespace | null = null;
  private artisanNamespace: Namespace | null = null;

  setManagerNamespace(namespace: Namespace): void {
    this.managerNamespace = namespace;
  }

  setTenantNamespace(namespace: Namespace): void {
    this.tenantNamespace = namespace;
  }

  setArtisanNamespace(namespace: Namespace): void {
    this.artisanNamespace = namespace;
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

  notifyArtisanDirectMessageCreated(payload: {
    threadId: string;
    messageId: string;
    managerUserId: string;
    artisanUserId: string;
  }): void {
    const eventPayload = {
      threadId: payload.threadId,
      messageId: payload.messageId,
      artisanId: payload.artisanUserId,
    };
    if (this.managerNamespace) {
      this.managerNamespace
        .to(managerMessagesRoom(payload.managerUserId))
        .emit('artisan-direct-message:created', eventPayload);
    }
    if (this.artisanNamespace) {
      this.artisanNamespace
        .to(artisanMessagesRoom(payload.artisanUserId))
        .emit('artisan-direct-message:created', eventPayload);
    }
  }
}
