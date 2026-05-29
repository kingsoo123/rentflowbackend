import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateMaintenanceRequestStatusDto } from '../maintenance/dto/update-maintenance-request-status.dto';
import { UserRole } from '../users/user-role.enum';
import { ManagersMaintenanceRequestsService } from './managers-maintenance-requests.service';

@Controller('managers/maintenance-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagersMaintenanceRequestsController {
  constructor(
    private readonly managersMaintenanceRequestsService: ManagersMaintenanceRequestsService,
  ) {}

  @Get()
  @Roles(UserRole.PROPERTY_MANAGER)
  list() {
    return this.managersMaintenanceRequestsService.listAllForManagers();
  }

  @Patch(':id')
  @Roles(UserRole.PROPERTY_MANAGER)
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceRequestStatusDto,
  ) {
    return this.managersMaintenanceRequestsService.updateStatus(id, dto.status);
  }
}
