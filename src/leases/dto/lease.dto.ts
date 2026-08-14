import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLeaseDto {
  @IsUUID()
  propertyId!: string;

  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unitLabel?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  rentAmount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  securityDeposit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentFrequency?: string;

  @IsString()
  @MinLength(20)
  @MaxLength(50000)
  termsText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  documentUrl?: string;
}

export class UpdateLeaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  unitLabel?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  rentAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  securityDeposit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentFrequency?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(50000)
  termsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  documentUrl?: string | null;
}

export class SignLeaseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  signatureName!: string;
}

export class TerminateLeaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

export class RenewLeaseDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  rentAmount?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(50000)
  termsText?: string;
}
