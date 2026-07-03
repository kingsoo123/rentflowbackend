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

/** Body for `POST /api/managers/artisans` — links an existing artisan account by login email. */
export class CreateArtisanDto {
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

  /** Trade, properties, availability, etc. from the manager wizard (stored as JSONB). */
  @IsOptional()
  @SanitizeTextRecord()
  @IsObject()
  profile?: Record<string, unknown>;
}
