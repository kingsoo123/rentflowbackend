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
  ValidateNested,
} from 'class-validator';
import { SanitizeText, SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';
import { PROPERTY_AMENITIES, PROPERTY_TYPES } from '../../properties/property-catalog';
import { PropertyBuildingDto } from './property-building.dto';

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

  @IsOptional()
  @IsIn([...PROPERTY_TYPES])
  propertyType?: (typeof PROPERTY_TYPES)[number];

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
