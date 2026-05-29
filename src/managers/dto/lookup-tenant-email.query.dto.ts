import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

/** Query for `GET /api/managers/tenants/lookup-email` — same normalization as signup. */
export class LookupTenantEmailQueryDto {
  @IsString()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
