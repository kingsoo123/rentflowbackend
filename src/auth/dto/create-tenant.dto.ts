import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Body for `POST /api/managers/tenants` — creates a user with role `tenant`. */
export class CreateTenantDto {
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
  @IsObject()
  profile?: Record<string, unknown>;
}
