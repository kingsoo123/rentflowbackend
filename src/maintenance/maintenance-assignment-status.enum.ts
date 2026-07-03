export enum MaintenanceAssignmentStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}

/** Workers must accept within this many hours of assignment. */
export const MAINTENANCE_ASSIGNMENT_ACCEPT_HOURS = 2;
