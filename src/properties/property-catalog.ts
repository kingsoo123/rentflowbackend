/** Whitelisted property types for create/update. */
export const PROPERTY_TYPES = [
  'apartment',
  'house',
  'duplex',
  'bungalow',
  'commercial',
  'mixed_use',
  'land',
  'other',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Common amenity tags managers can toggle. */
export const PROPERTY_AMENITIES = [
  'parking',
  'elevator',
  'security',
  'generator',
  'swimming_pool',
  'gym',
  'playground',
  'laundry',
  'cctv',
  'water_borehole',
  'waste_disposal',
  'furnished',
  'wifi',
  'balcony',
  'garden',
] as const;

export type PropertyAmenity = (typeof PROPERTY_AMENITIES)[number];

export const PROPERTY_DOCUMENT_TYPES = [
  'lease_template',
  'floor_plan',
  'insurance',
  'title',
  'inspection_report',
  'other',
] as const;

export type PropertyDocumentType = (typeof PROPERTY_DOCUMENT_TYPES)[number];
