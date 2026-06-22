import sanitizeHtml from 'sanitize-html';

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/** Strip HTML/script from free-text user input before persistence or display. */
export function sanitizeUserText(input: string): string {
  return sanitizeHtml(input, PLAIN_TEXT_OPTIONS).trim();
}

export function sanitizeOptionalUserText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const raw = typeof value === 'string' ? value : String(value);
  const trimmed = raw.trim();
  if (trimmed === '') {
    return undefined;
  }
  return sanitizeUserText(trimmed);
}

/** Sanitize string values in profile / lease answer objects (JSONB). */
export function sanitizeUserTextRecord(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed !== '') {
        out[key] = sanitizeUserText(trimmed);
      }
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  return out;
}

export function sanitizeTextTransform({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return sanitizeUserText(value);
}

export function sanitizeOptionalTextTransform({ value }: { value: unknown }): unknown {
  return sanitizeOptionalUserText(value);
}
