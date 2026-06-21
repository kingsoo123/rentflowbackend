/** Extract proposed rent from generated renewal notice body text. */
export function extractRenewalRentFromNoticeBody(
  body: string | null | undefined,
): string | null {
  if (!body?.trim()) {
    return null;
  }
  const match = body.match(
    /Proposed monthly rent(?: following this review)?:\s*(.+)/i,
  );
  if (!match) {
    return null;
  }
  const raw = match[1].split('\n')[0]?.trim() ?? '';
  if (!raw || /^\[amount\]$/i.test(raw) || raw === '—' || raw === '-') {
    return null;
  }
  const withoutCurrency = raw.replace(/^\$/, '').trim();
  if (/^[\d,]+(?:\.\d{2})?$/.test(withoutCurrency)) {
    return withoutCurrency;
  }
  return raw;
}

export type RenewalSummaryFields = {
  renewalMonthlyRentDisplay: string | null;
  renewalEffectiveDate: string | null;
};

/** Merge the newest non-empty rent/date from recent renewal notices (newest first). */
export function mergeRenewalSummaryFromNotices(
  rows: Array<{
    renewalMonthlyRentDisplay?: string | null;
    renewalEffectiveDate?: string | null | Date;
    body?: string | null;
  }>,
  normalizeDate: (value: unknown) => string | null,
): RenewalSummaryFields {
  let renewalMonthlyRentDisplay: string | null = null;
  let renewalEffectiveDate: string | null = null;

  for (const row of rows) {
    if (!renewalMonthlyRentDisplay) {
      const structured = row.renewalMonthlyRentDisplay?.trim() || null;
      renewalMonthlyRentDisplay =
        structured || extractRenewalRentFromNoticeBody(row.body ?? null);
    }
    if (!renewalEffectiveDate) {
      renewalEffectiveDate = normalizeDate(row.renewalEffectiveDate ?? null);
    }
    if (renewalMonthlyRentDisplay && renewalEffectiveDate) {
      break;
    }
  }

  return { renewalMonthlyRentDisplay, renewalEffectiveDate };
}
