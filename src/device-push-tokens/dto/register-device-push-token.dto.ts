import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDevicePushTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(8192)
  token: string;

  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  /** `native` = FCM/APNs device token; `expo` = Expo push token (recommended for iOS + Android alerts). */
  @IsOptional()
  @IsIn(['native', 'expo'])
  tokenProvider?: 'native' | 'expo';
}
