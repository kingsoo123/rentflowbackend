import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

@Injectable()
export class ArtisanNotificationsRealtimeService {
  private namespace: Namespace | null = null;

  setNamespace(namespace: Namespace): void {
    this.namespace = namespace;
  }

  notifyArtisan(artisanUserId: string, payload: { id?: string } = {}): void {
    this.namespace?.to(artisanNotificationsRoom(artisanUserId)).emit('notifications:updated', payload);
  }

  notifyAssignmentsUpdated(artisanUserId: string): void {
    this.namespace
      ?.to(artisanNotificationsRoom(artisanUserId))
      .emit('assignments:updated', {});
  }
}

export function artisanNotificationsRoom(artisanUserId: string): string {
  return `artisan-notifications:${artisanUserId}`;
}
