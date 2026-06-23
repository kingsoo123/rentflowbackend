import { BadRequestException } from '@nestjs/common';
import { isAllowedPhoneCountryDial } from './phone-country-codes';

export function normalizeSignupPhone(
  countryCode: string,
  nationalRaw: string,
): { phoneCountryCode: string; phoneNumber: string } {
  const phoneCountryCode = typeof countryCode === 'string' ? countryCode.trim() : '';
  const phoneNumber =
    typeof nationalRaw === 'string' ? nationalRaw.replace(/\D/g, '') : '';

  if (!isAllowedPhoneCountryDial(phoneCountryCode)) {
    throw new BadRequestException('Select a valid country code');
  }
  if (!/^\d{4,15}$/.test(phoneNumber)) {
    throw new BadRequestException('Enter a valid phone number (4–15 digits)');
  }

  return { phoneCountryCode, phoneNumber };
}
