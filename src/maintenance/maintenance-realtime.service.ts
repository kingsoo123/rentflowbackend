import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/** Bridges HTTP services to the Socket.IO namespace for manager maintenance updates. */
@Injectable()
export class MaintenanceRealtimeService {
  private namespace: Namespace | null = null;

  setNamespace(namespace: Namespace): void {
    this.namespace = namespace;
  }

  /**
   * Notify property managers on this tenant's occupancy roster that a new request exists.
   * (Per-manager rooms — not every manager in the system.)
   */
  notifyMaintenanceCreated(
    payload: { id: string },
    managerUserIds: string[],
  ): void {
    if (!this.namespace || managerUserIds.length === 0) {
      return;
    }
    for (const managerUserId of managerUserIds) {
      this.namespace.to(`manager:${managerUserId}`).emit('maintenance:created', payload);
    }
  }

  /** Same namespace as maintenance — clients already connect here for manager live updates. */
  notifyLeaseFormSubmitted(
    payload: { id: string; tenantId: string; tenantName: string },
    managerUserIds: string[],
  ): void {
    if (!this.namespace || managerUserIds.length === 0) {
      return;
    }
    for (const managerUserId of managerUserIds) {
      this.namespace.to(`manager:${managerUserId}`).emit('lease_form:submitted', payload);
    }
  }

  notifyPaymentSubmitted(
    payload: {
      id: string;
      tenantId: string;
      tenantName: string;
      paymentType: string;
      amountDisplay: string | null;
    },
    managerUserIds: string[],
  ): void {
    if (!this.namespace || managerUserIds.length === 0) {
      return;
    }
    for (const managerUserId of managerUserIds) {
      this.namespace.to(`manager:${managerUserId}`).emit('payment:submitted', payload);
    }
  }

  /** Tell manager clients to refetch revenue cards (MTD collected / scheduled / last month). */
  notifyRevenueUpdated(managerUserId: string): void {
    if (!this.namespace) {
      return;
    }
    this.namespace.to(`manager:${managerUserId}`).emit('revenue:updated', {});
  }

  /** Tell manager clients to refetch occupancy tenant tables after roster changes. */
  notifyOccupancyUpdated(managerUserId: string): void {
    if (!this.namespace) {
      return;
    }
    this.namespace.to(`manager:${managerUserId}`).emit('occupancy:updated', {});
  }
}
