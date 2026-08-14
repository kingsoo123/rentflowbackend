export enum LeaseStatus {
  DRAFT = 'draft',
  PENDING_TENANT_SIGNATURE = 'pending_tenant_signature',
  PENDING_MANAGER_COUNTERSIGNATURE = 'pending_manager_countersignature',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
  SUPERSEDED = 'superseded',
}
