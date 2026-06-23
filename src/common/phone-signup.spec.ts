import { BadRequestException } from '@nestjs/common';
import { normalizeSignupPhone } from './phone-signup';

describe('normalizeSignupPhone', () => {
  it('accepts valid country code and national digits', () => {
    expect(normalizeSignupPhone('+234', '0801 234 5678')).toEqual({
      phoneCountryCode: '+234',
      phoneNumber: '08012345678',
    });
  });

  it('rejects unknown dial codes', () => {
    expect(() => normalizeSignupPhone('+999', '8012345678')).toThrow(BadRequestException);
  });

  it('rejects too-short national numbers', () => {
    expect(() => normalizeSignupPhone('+234', '123')).toThrow(BadRequestException);
  });
});
