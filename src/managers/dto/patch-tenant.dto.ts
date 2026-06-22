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
  SanitizeTextOptional,
  SanitizeTextRecord,
} from '../../common/decorators/sanitize-text.decorator';

/** Body for `PATCH /api/managers/tenants/:id` — partial updates to auth user + profile JSON. */
export class PatchTenantDto {
  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @SanitizeTextRecord()
  @IsObject()
  profile?: Record<string, unknown>;
}
