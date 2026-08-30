import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';
import { PROPERTY_AMENITIES, PROPERTY_TYPES } from '../../properties/property-catalog';
import { PropertyBuildingDto } from './property-building.dto';

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

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsIn([...PROPERTY_TYPES])
  propertyType?: (typeof PROPERTY_TYPES)[number] | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsIn([...PROPERTY_AMENITIES], { each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUrl({ require_tld: false }, { each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PropertyBuildingDto)
  buildings?: PropertyBuildingDto[];
}
