import { Module } from '@nestjs/common';
import { DevicePushTokensModule } from '../device-push-tokens/device-push-tokens.module';
import { FcmPushService } from './fcm-push.service';
import { FirebaseAdminService } from './firebase-admin.service';

@Module({
  imports: [DevicePushTokensModule],
  providers: [FirebaseAdminService, FcmPushService],
  exports: [FirebaseAdminService, FcmPushService],
})
export class FirebaseModule {}
