import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SanitizeText } from '../../common/decorators/sanitize-text.decorator';
import { MaintenanceUrgency } from '../maintenance-urgency.enum';

export class SubmitMaintenanceRequestDto {
  @SanitizeText()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @SanitizeText()
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  description: string;

  @IsEnum(MaintenanceUrgency)
  urgency: MaintenanceUrgency;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true }, { each: true })
  @MaxLength(2048, { each: true })
  attachmentUrls?: string[];
}
