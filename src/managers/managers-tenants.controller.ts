import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { CreateTenantDto } from '../auth/dto/create-tenant.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { ListManagersTenantsQueryDto } from './dto/list-managers-tenants.query.dto';
import { LookupTenantEmailQueryDto } from './dto/lookup-tenant-email.query.dto';
import { PatchTenantDto } from './dto/patch-tenant.dto';
import { ManagersTenantsService } from './managers-tenants.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersTenantsController {
  constructor(
    private readonly authService: AuthService,
    private readonly managersTenantsService: ManagersTenantsService,
  ) {}

  @Get()
  list(@Query() query: ListManagersTenantsQueryDto, @Req() req: AuthedManagerRequest) {
    return this.managersTenantsService.listTenants(req.user.sub, query);
  }

  /** Must stay above `GET :id` so `lookup-email` is not parsed as a UUID. */
  @Get('lookup-email')
  lookupEmail(@Query() query: LookupTenantEmailQueryDto) {
    return this.managersTenantsService.checkTenantEmailRegistered(query.email);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedManagerRequest) {
    return this.managersTenantsService.getTenantDetail(req.user.sub, id);
  }

  @Patch(':id')
  patchOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchTenantDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.managersTenantsService.updateTenant(req.user.sub, id, dto);
  }

  @Post()
  async create(
    @Body() dto: CreateTenantDto,
    @Req() req: AuthedManagerRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.managersTenantsService.assertCreateTenantProfileAllowedForManager(
      req.user.sub,
      dto.profile && typeof dto.profile === 'object' && !Array.isArray(dto.profile)
        ? (dto.profile as Record<string, unknown>)
        : undefined,
    );
    const { user, updated } = await this.authService.createTenantByManager(dto);
    res.status(updated ? HttpStatus.OK : HttpStatus.CREATED);
    return user;
  }
}
