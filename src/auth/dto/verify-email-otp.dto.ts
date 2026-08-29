import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class VerifyEmailOtpDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  /** 6-digit code from the verification email. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your email' })
  code: string;
}
