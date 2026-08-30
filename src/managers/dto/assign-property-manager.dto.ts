import { IsEmail, MaxLength } from 'class-validator';
import { SanitizeText } from '../../common/decorators/sanitize-text.decorator';

export class AssignPropertyManagerDto {
  @SanitizeText()
  @IsEmail()
  @MaxLength(254)
  email: string;
}
