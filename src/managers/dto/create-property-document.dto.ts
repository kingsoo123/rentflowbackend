import { IsIn, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../common/decorators/sanitize-text.decorator';
import { PROPERTY_DOCUMENT_TYPES } from '../../properties/property-catalog';

export class CreatePropertyDocumentDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsIn([...PROPERTY_DOCUMENT_TYPES])
  documentType: (typeof PROPERTY_DOCUMENT_TYPES)[number];

  @IsString()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url: string;
}
