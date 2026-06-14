export type LeaseFormFieldType = 'text' | 'textarea' | 'checkbox';

export type LeaseFormFieldDef = {
  key: string;
  label: string;
  type: LeaseFormFieldType;
  /** For checkbox: must be checked (true) when required. */
  required?: boolean;
  placeholder?: string;
};

export type LeaseFormTemplateDef = {
  slug: string;
  title: string;
  intro: string;
  fields: LeaseFormFieldDef[];
  signaturePrompt: string;
};

/** Single built-in form — extend with more slugs later. */
export const RESIDENT_LEASE_ACKNOWLEDGMENT_V1: LeaseFormTemplateDef = {
  slug: 'resident_lease_acknowledgment_v1',
  title: 'Resident acknowledgment & contact confirmation',
  intro:
    'Please read each item, complete the fields, and sign electronically at the bottom. ' +
    'Your property manager will receive a copy when you submit.',
  fields: [
    {
      key: 'acknowledge_house_rules',
      label:
        'I have read and agree to comply with the building / community house rules provided by management.',
      type: 'checkbox',
      required: true,
    },
    {
      key: 'acknowledge_insurance',
      label:
        'I understand that I am encouraged to carry renters insurance and that the landlord / management is not responsible for my personal property except as required by law.',
      type: 'checkbox',
      required: true,
    },
    {
      key: 'emergency_contact_name',
      label: 'Emergency contact name',
      type: 'text',
      required: true,
      placeholder: 'Full name',
    },
    {
      key: 'emergency_contact_phone',
      label: 'Emergency contact phone',
      type: 'text',
      required: true,
      placeholder: 'Mobile number',
    },
    {
      key: 'vehicle_tag',
      label: 'Vehicle / parking permit (if applicable)',
      type: 'text',
      required: false,
      placeholder: 'Make, model, plate, or “none”',
    },
    {
      key: 'additional_notes',
      label: 'Anything else we should know?',
      type: 'textarea',
      required: false,
      placeholder: 'Optional notes for your manager',
    },
  ],
  signaturePrompt:
    'Electronic signature: type your full legal name exactly as it should appear on this document.',
};

const BY_SLUG: Record<string, LeaseFormTemplateDef> = {
  [RESIDENT_LEASE_ACKNOWLEDGMENT_V1.slug]: RESIDENT_LEASE_ACKNOWLEDGMENT_V1,
};

export function getLeaseFormTemplate(slug: string): LeaseFormTemplateDef | undefined {
  return BY_SLUG[slug.trim()];
}

export function listLeaseFormTemplates(): LeaseFormTemplateDef[] {
  return Object.values(BY_SLUG);
}
