import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { TenantSignInspectionDto } from './dto/inspection.dto';
import { InspectionsService } from './inspections.service';

type AuthedTenantRequest = Request & { user: JwtAccessPayload };

@Controller('tenants/inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantInspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get()
  list(@Req() req: AuthedTenantRequest) {
    return this.inspectionsService.listForTenant(req.user.sub);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedTenantRequest,
  ) {
    return this.inspectionsService.getForTenant(req.user.sub, id);
  }

  @Post(':id/signoff')
  signoff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TenantSignInspectionDto,
    @Req() req: AuthedTenantRequest,
  ) {
    return this.inspectionsService.signForTenant(req.user.sub, id, dto);
  }
}
