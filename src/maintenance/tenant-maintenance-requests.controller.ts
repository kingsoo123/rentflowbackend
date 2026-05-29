import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SubmitMaintenanceRequestDto } from './dto/submit-maintenance-request.dto';
import { TenantMaintenanceRequestsService } from './tenant-maintenance-requests.service';

@Controller('tenants/maintenance-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantMaintenanceRequestsController {
  constructor(
    private readonly tenantMaintenanceRequestsService: TenantMaintenanceRequestsService,
  ) {}

  @Get()
  list(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantMaintenanceRequestsService.listForTenant(req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: SubmitMaintenanceRequestDto,
  ) {
    return this.tenantMaintenanceRequestsService.createForTenant(
      req.user.sub,
      dto,
    );
  }
}
