import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SanitizeText,
  SanitizeTextOptional,
} from '../../common/decorators/sanitize-text.decorator';
import { sanitizeOptionalUserText } from '../../common/sanitize-user-text';

/** Merges legacy `tenantEmail` with `tenantEmails` (deduped, lowercased). */
export function mergeRentRenewalRecipientEmails(
  dto: Pick<SendRentRenewalNoticeDto, 'tenantEmail' | 'tenantEmails'>,
): string[] {
  const set = new Set<string>();
  if (typeof dto.tenantEmail === 'string' && dto.tenantEmail.trim()) {
    set.add(dto.tenantEmail.trim().toLowerCase());
  }
  if (Array.isArray(dto.tenantEmails)) {
    for (const e of dto.tenantEmails) {
      if (typeof e === 'string' && e.trim()) {
        set.add(e.trim().toLowerCase());
      }
    }
  }
  return [...set];
}

export class SendRentRenewalNoticeDto {
  /**
   * Single tenant login email (legacy). You may send `tenantEmails` instead,
   * or both — addresses are merged and deduped.
   */
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  tenantEmail?: string;

  /** One or more tenant login emails (each must be an existing tenant account). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsEmail({}, { each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value
      .map((v: unknown) =>
        typeof v === 'string' ? v.trim().toLowerCase() : '',
      )
      .filter((s: string) => s.length > 0);
  })
  tenantEmails?: string[];

  @SanitizeText()
  @IsString()
  @MinLength(20, { message: 'Notice body is too short' })
  @MaxLength(20000, { message: 'Notice body is too long' })
  noticeBody!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => {
    const sanitized = sanitizeOptionalUserText(value);
    return typeof sanitized === 'string' ? sanitized.slice(0, 280) : sanitized;
  })
  headline?: string;

  /** Proposed monthly rent as shown on the renewal form (optional). */
  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(128)
  renewalMonthlyRentDisplay?: string;

  /** Current lease end / renewal anchor date from the manager form, YYYY-MM-DD (optional). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'renewalEffectiveDate must be a calendar date (YYYY-MM-DD)',
  })
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      return undefined;
    }
    const t = value.trim();
    return t === '' ? undefined : t;
  })
  renewalEffectiveDate?: string;
}
