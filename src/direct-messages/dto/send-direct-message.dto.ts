import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendDirectMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(2000, { message: 'Message is too long' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  body!: string;
}
