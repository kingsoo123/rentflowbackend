import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { ServiceChargesService } from './service-charges.service';

type AuthedTenantRequest = Request & { user: JwtAccessPayload };

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantsServiceChargesController {
  constructor(private readonly serviceChargesService: ServiceChargesService) {}

  @Get('service-charges')
  list(@Req() req: AuthedTenantRequest) {
    return this.serviceChargesService.listForTenant(req.user.sub);
  }
}
