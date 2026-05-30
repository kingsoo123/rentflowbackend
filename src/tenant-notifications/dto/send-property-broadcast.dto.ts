import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendPropertyBroadcastDto {
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  headline!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
