import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  IsBoolean,
  Equals,
  IsOptional,
  Matches,
} from 'class-validator';
import { SanitizeText, SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';
import { UserRole } from '../../users/user-role.enum';

/** Request body aligned with `rent_pilot/components/auth/AuthOnboarding.tsx` (signup). */
export class SignupDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  /** International dial code, e.g. `+234`. */
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  @Matches(/^\+\d{1,4}$/, { message: 'Select a valid country code' })
  phoneCountryCode: string;

  /** National number digits only (no country code). */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(15)
  @Matches(/^\d+$/, { message: 'Phone number must contain digits only' })
  phoneNumber: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  confirmPassword: string;

  /** Must be true (same as required terms checkbox on the form). */
  @Transform(({ value }) =>
    value === true || value === 'true' || value === 'on' ? true : value,
  )
  @IsBoolean()
  @Equals(true, {
    message: 'You must accept the terms and privacy policy',
  })
  terms: boolean;

  /**
   * Property managers: comma-separated property names (each trimmed; duplicates
   * after case-insensitive normalization are ignored). Required for `property_manager`
   * at signup — validated in `AuthService.signup`.
   */
  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(8000)
  propertyNames?: string;
}
