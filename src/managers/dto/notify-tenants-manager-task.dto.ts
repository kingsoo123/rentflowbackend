import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  SanitizeText,
  SanitizeTextOptional,
} from '../../common/decorators/sanitize-text.decorator';

export class NotifyTenantsManagerTaskDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(120)
  dueLabel?: string;

  /** If omitted, all tenants on your occupancy roster (max 200) are notified. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(150)
  @IsUUID('4', { each: true })
  tenantIds?: string[];
}
