import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ManagerChatMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(2000, { message: 'Message is too long' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;
}
