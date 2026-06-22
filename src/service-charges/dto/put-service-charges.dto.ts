import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SanitizeText } from '../../common/decorators/sanitize-text.decorator';

export class ServiceChargeLineInputDto {
  @SanitizeText()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  amount: number;
}

export class PutServiceChargesDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ServiceChargeLineInputDto)
  lines: ServiceChargeLineInputDto[];
}
