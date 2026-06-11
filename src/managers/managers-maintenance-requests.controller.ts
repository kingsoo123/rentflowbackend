import {
  Body,
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
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateMaintenanceRequestStatusDto } from '../maintenance/dto/update-maintenance-request-status.dto';
import { UserRole } from '../users/user-role.enum';
import { ManagersMaintenanceRequestsService } from './managers-maintenance-requests.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/maintenance-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersMaintenanceRequestsController {
  constructor(
    private readonly managersMaintenanceRequestsService: ManagersMaintenanceRequestsService,
  ) {}

  @Get()
  list(@Req() req: AuthedManagerRequest) {
    return this.managersMaintenanceRequestsService.listForManager(req.user.sub);
  }

  @Patch(':id')
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceRequestStatusDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.managersMaintenanceRequestsService.updateStatus(
      req.user.sub,
      id,
      dto.status,
    );
  }
}
