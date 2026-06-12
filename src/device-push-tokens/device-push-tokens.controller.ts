import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RegisterDevicePushTokenDto } from './dto/register-device-push-token.dto';
import { DevicePushTokensService } from './device-push-tokens.service';

type AuthedRequest = Request & { user: JwtAccessPayload };

@Controller('device-push-token')
@UseGuards(JwtAuthGuard)
export class DevicePushTokensController {
  constructor(private readonly devicePushTokensService: DevicePushTokensService) {}

  @Post()
  register(@Req() req: AuthedRequest, @Body() dto: RegisterDevicePushTokenDto) {
    return this.devicePushTokensService.upsertForUser(req.user.sub, dto).then(() => ({ ok: true }));
  }
}
