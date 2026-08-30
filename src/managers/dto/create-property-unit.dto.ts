import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText, SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';
import { PropertyUnitStatus } from '../../properties/property-unit-status.enum';

export class CreatePropertyUnitDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsOptional()
  @IsEnum(PropertyUnitStatus)
  status?: PropertyUnitStatus;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
