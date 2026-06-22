import {
  sanitizeUserText,
  sanitizeUserTextRecord,
} from './sanitize-user-text';

describe('sanitizeUserText', () => {
  it('removes script tags and their contents', () => {
    expect(sanitizeUserText("<script>alert('hack')</script>")).toBe('');
    expect(sanitizeUserText("Paid rent <script>alert('hack')</script> for June")).toBe(
      'Paid rent  for June',
    );
  });

  it('strips event-handler attributes from markup', () => {
    expect(sanitizeUserText('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('preserves normal text', () => {
    expect(sanitizeUserText('  Rent paid for Unit 4B  ')).toBe('Rent paid for Unit 4B');
  });
});

describe('sanitizeUserTextRecord', () => {
  it('sanitizes string profile fields', () => {
    expect(
      sanitizeUserTextRecord({
        phone: '<b>555</b>',
        unitNumber: '4B',
        active: true,
      }),
    ).toEqual({
      phone: '555',
      unitNumber: '4B',
      active: true,
    });
  });
});
