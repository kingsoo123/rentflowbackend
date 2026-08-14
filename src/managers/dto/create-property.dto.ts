import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SanitizeText, SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';

export class CreatePropertyDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(4000)
  addressLine?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(120)
  stateRegion?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  unitCount?: number;
}
