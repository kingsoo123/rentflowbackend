import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText, SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';

export class CreatePropertyUnitDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
