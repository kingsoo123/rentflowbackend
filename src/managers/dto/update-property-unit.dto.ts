import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';

export class UpdatePropertyUnitDto {
  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  /** Pass null to clear. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
