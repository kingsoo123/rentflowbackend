import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import {
  SanitizeText,
  SanitizeTextRecord,
} from '../../common/decorators/sanitize-text.decorator';

export class SubmitLeaseFormDto {
  @SanitizeText()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  formSlug!: string;

  @SanitizeTextRecord()
  @IsObject()
  answers!: Record<string, unknown>;

  @SanitizeText()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  signatureText!: string;
}
