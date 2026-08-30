import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import type { UserRole } from '../users/user-role.enum';

export type AdminAccountCreatedPayload = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole | string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
};

/** Bridges account lifecycle events to the admin Socket.IO namespace. */
@Injectable()
export class AdminRealtimeService {
  private namespace: Namespace | null = null;

  setNamespace(namespace: Namespace): void {
    this.namespace = namespace;
  }

  notifyAccountCreated(payload: AdminAccountCreatedPayload): void {
    if (!this.namespace) {
      return;
    }
    this.namespace.to('admins').emit('account:created', payload);
  }

  /** Soft signal to refresh lists/stats (e.g. after hard delete). */
  notifyAccountsChanged(reason: 'deleted' | 'updated' = 'updated'): void {
    if (!this.namespace) {
      return;
    }
    this.namespace.to('admins').emit('accounts:changed', { reason });
  }
}
