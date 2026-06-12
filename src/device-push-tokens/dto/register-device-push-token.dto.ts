import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDevicePushTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(8192)
  token: string;

  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}
