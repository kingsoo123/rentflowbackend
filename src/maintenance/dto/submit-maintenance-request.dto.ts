import { Transform } from 'class-transformer';
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
import { MaintenanceUrgency } from '../maintenance-urgency.enum';

export class SubmitMaintenanceRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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
