import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DevicePushTokensController } from './device-push-tokens.controller';
import { DevicePushTokensService } from './device-push-tokens.service';
import { UserDevicePushToken } from './user-device-push-token.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([UserDevicePushToken])],
  controllers: [DevicePushTokensController],
  providers: [DevicePushTokensService, JwtAuthGuard],
  exports: [DevicePushTokensService],
})
export class DevicePushTokensModule {}
