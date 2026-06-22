import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText, SanitizeTextOptional } from '../../common/decorators/sanitize-text.decorator';
import { PaymentType } from '../payment-type.enum';

export class SubmitPaymentConfirmationDto {
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  receiptPath: string;

  @IsOptional()
  @SanitizeTextOptional()
  @IsString()
  @MaxLength(64)
  amountDisplay?: string;
}
