import { Transform } from 'class-transformer';
import {
  sanitizeOptionalTextTransform,
  sanitizeTextTransform,
  sanitizeUserTextRecord,
} from '../sanitize-user-text';

/** Trim and strip HTML from a required string DTO field. */
export function SanitizeText(): PropertyDecorator {
  return Transform(sanitizeTextTransform);
}

/** Trim and strip HTML; empty strings become `undefined`. */
export function SanitizeTextOptional(): PropertyDecorator {
  return Transform(sanitizeOptionalTextTransform);
}

/** Sanitize all string values in a JSON object DTO field (e.g. tenant profile). */
export function SanitizeTextRecord(): PropertyDecorator {
  return Transform(({ value }) => sanitizeUserTextRecord(value));
}
