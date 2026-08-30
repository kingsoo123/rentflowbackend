/** Operational availability for a rentable unit (independent of tenant occupancy). */
export enum PropertyUnitStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  UNDER_MAINTENANCE = 'under_maintenance',
  UNAVAILABLE = 'unavailable',
}

export const PROPERTY_UNIT_STATUSES = Object.values(PropertyUnitStatus);

export function isPropertyUnitStatus(value: unknown): value is PropertyUnitStatus {
  return (
    typeof value === 'string' &&
    (PROPERTY_UNIT_STATUSES as string[]).includes(value)
  );
}

export function propertyUnitStatusLabel(status: PropertyUnitStatus): string {
  switch (status) {
    case PropertyUnitStatus.AVAILABLE:
      return 'Available';
    case PropertyUnitStatus.RESERVED:
      return 'Reserved';
    case PropertyUnitStatus.UNDER_MAINTENANCE:
      return 'Under maintenance';
    case PropertyUnitStatus.UNAVAILABLE:
      return 'Unavailable';
    default:
      return status;
  }
}
