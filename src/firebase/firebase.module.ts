import { Module } from '@nestjs/common';
import { DevicePushTokensModule } from '../device-push-tokens/device-push-tokens.module';
import { ExpoPushService } from './expo-push.service';
import { FcmPushService } from './fcm-push.service';
import { FirebaseAdminService } from './firebase-admin.service';

@Module({
  imports: [DevicePushTokensModule],
  providers: [FirebaseAdminService, ExpoPushService, FcmPushService],
  exports: [FirebaseAdminService, ExpoPushService, FcmPushService],
})
export class FirebaseModule {}
