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
import { TenantNotificationsService } from './tenant-notifications.service';

@Controller('tenants/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantNotificationsController {
  constructor(
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  @Get()
  list(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantNotificationsService.listForTenant(req.user.sub);
  }

  @Patch(':id/read')
  async markRead(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tenantNotificationsService.markRead(req.user.sub, id);
    return { ok: true };
  }
}
