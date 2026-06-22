import { IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../common/decorators/sanitize-text.decorator';

export class SendPropertyBroadcastDto {
  @SanitizeText()
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  headline!: string;

  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
