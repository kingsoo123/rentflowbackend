import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitLeaseFormDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  formSlug!: string;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  signatureText!: string;
}
