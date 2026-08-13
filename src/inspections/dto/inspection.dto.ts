import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { InspectionItemCondition, InspectionOverallCondition } from '../inspection-condition.enum';
import { InspectionType } from '../inspection-type.enum';

export class InspectionChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(120)
  area!: string;

  @IsString()
  @MaxLength(200)
  item!: string;

  @IsEnum(InspectionItemCondition)
  condition!: InspectionItemCondition;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateInspectionDto {
  @IsUUID()
  propertyId!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsEnum(InspectionType)
  type!: InspectionType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unitLabel?: string;

  @IsDateString()
  inspectedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(InspectionOverallCondition)
  overallCondition?: InspectionOverallCondition;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => InspectionChecklistItemDto)
  checklistItems?: InspectionChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  photoUrls?: string[];

  /** When true, mark completed and request tenant sign-off if a tenant is linked. */
  @IsOptional()
  @IsBoolean()
  requestTenantSignoff?: boolean;
}

export class UpdateInspectionDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string | null;

  @IsOptional()
  @IsEnum(InspectionType)
  type?: InspectionType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unitLabel?: string | null;

  @IsOptional()
  @IsDateString()
  inspectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(InspectionOverallCondition)
  overallCondition?: InspectionOverallCondition | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => InspectionChecklistItemDto)
  checklistItems?: InspectionChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  photoUrls?: string[];
}

export class CompleteInspectionDto {
  @IsOptional()
  @IsBoolean()
  requestTenantSignoff?: boolean;
}

export class TenantSignInspectionDto {
  @IsString()
  @MaxLength(200)
  signatureName!: string;
}
