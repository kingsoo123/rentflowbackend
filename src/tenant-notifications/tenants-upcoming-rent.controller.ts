import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { TenantNotificationsService } from './tenant-notifications.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantsUpcomingRentController {
  constructor(
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  @Get('upcoming-rent')
  upcomingRent(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantNotificationsService.getUpcomingRentSummary(req.user.sub);
  }
}
