import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';

export class UpdatePropertyDto {
  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

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
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(120)
  collectionBankName?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(200)
  collectionAccountName?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(64)
  collectionAccountNumber?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(4000)
  collectionPaymentInstructions?: string;

  /** Pass null to clear. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  unitCount?: number | null;
}
