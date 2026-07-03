import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { ArtisanNotificationsService } from './artisan-notifications.service';

type AuthedArtisanRequest = Request & { user: JwtAccessPayload };

@Controller('artisans/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ARTISAN)
export class ArtisansNotificationsController {
  constructor(private readonly artisanNotificationsService: ArtisanNotificationsService) {}

  @Get()
  list(@Req() req: AuthedArtisanRequest) {
    return this.artisanNotificationsService.listForArtisan(req.user.sub);
  }

  @Patch(':id/read')
  async markRead(
    @Req() req: AuthedArtisanRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.artisanNotificationsService.markRead(req.user.sub, id);
    return { ok: true };
  }
}
