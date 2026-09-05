import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { PricingPlanId } from '../pricing-plans';

export class CreatePricingCheckoutDto {
  @IsIn(['professional', 'enterprise'])
  planId!: PricingPlanId;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
