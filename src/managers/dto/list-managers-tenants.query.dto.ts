import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';

export class ListManagersTenantsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Case-insensitive match on `profile.propertyAssigned`. */
  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(200)
  property?: string;

  /** When set, only tenants assigned to this managed property (by exact name match) are returned. */
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  propertyId?: string;
}
