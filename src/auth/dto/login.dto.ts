import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Matches `rent_pilot` sign-in form (`AuthOnboarding.tsx`). */
export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(72)
  password: string;

  /** Longer-lived JWT when true (“Keep me signed in”). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    return value === true || value === 'true' || value === 'on';
  })
  @IsBoolean()
  remember?: boolean;
}
