/** Dial codes accepted at signup — keep in sync with web/mobile `phone-country-codes` lists. */
export const PHONE_COUNTRY_DIAL_CODES = [
  '+234',
  '+233',
  '+254',
  '+27',
  '+20',
  '+1',
  '+44',
  '+353',
  '+33',
  '+49',
  '+31',
  '+32',
  '+34',
  '+39',
  '+351',
  '+91',
  '+92',
  '+880',
  '+971',
  '+966',
  '+61',
  '+64',
  '+55',
  '+52',
  '+86',
  '+81',
  '+65',
  '+60',
  '+63',
] as const;

export type PhoneCountryDialCode = (typeof PHONE_COUNTRY_DIAL_CODES)[number];

const DIAL_CODE_SET = new Set<string>(PHONE_COUNTRY_DIAL_CODES);

export function isAllowedPhoneCountryDial(dial: string): boolean {
  return DIAL_CODE_SET.has(dial.trim());
}
