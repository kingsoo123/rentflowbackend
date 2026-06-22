import { IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../common/decorators/sanitize-text.decorator';

export class SendDirectMessageDto {
  @SanitizeText()
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(2000, { message: 'Message is too long' })
  body!: string;
}
