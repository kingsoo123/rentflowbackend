import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SanitizeText,
  SanitizeTextRecord,
} from '../../common/decorators/sanitize-text.decorator';

/** Body for `POST /api/managers/tenants` — creates a user with role `tenant`. */
export class CreateTenantDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  /** Extended onboarding fields from the property manager wizard (stored as JSONB). */
  @IsOptional()
  @SanitizeTextRecord()
  @IsObject()
  profile?: Record<string, unknown>;
}
