import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

/** Query for `GET /api/managers/artisans/lookup-email`. */
export class LookupArtisanEmailQueryDto {
  @IsString()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
