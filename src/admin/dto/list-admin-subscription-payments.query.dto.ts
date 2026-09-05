import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PricingCheckoutStatus } from '../../pricing/pricing-checkout-status.enum';

export class ListAdminSubscriptionPaymentsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : 1;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => {
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : 25;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(PricingCheckoutStatus)
  status?: PricingCheckoutStatus;
}
