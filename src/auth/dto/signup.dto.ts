import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  IsBoolean,
  Equals,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

/** Request body aligned with `rent_pilot/components/auth/AuthOnboarding.tsx` (signup). */
export class SignupDto {
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
}
