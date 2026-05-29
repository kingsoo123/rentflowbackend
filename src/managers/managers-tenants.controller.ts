import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { CreateTenantDto } from '../auth/dto/create-tenant.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { ListManagersTenantsQueryDto } from './dto/list-managers-tenants.query.dto';
import { LookupTenantEmailQueryDto } from './dto/lookup-tenant-email.query.dto';
import { ManagersTenantsService } from './managers-tenants.service';

@Controller('managers/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersTenantsController {
  constructor(
    private readonly authService: AuthService,
    private readonly managersTenantsService: ManagersTenantsService,
  ) {}

  @Get()
  list(@Query() query: ListManagersTenantsQueryDto) {
    return this.managersTenantsService.listTenants(query);
  }

  /** Must stay above `GET :id` so `lookup-email` is not parsed as a UUID. */
  @Get('lookup-email')
  lookupEmail(@Query() query: LookupTenantEmailQueryDto) {
    return this.managersTenantsService.checkTenantEmailRegistered(query.email);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.managersTenantsService.getTenantDetail(id);
  }

  @Post()
  async create(
    @Body() dto: CreateTenantDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, updated } = await this.authService.createTenantByManager(dto);
    res.status(updated ? HttpStatus.OK : HttpStatus.CREATED);
    return user;
  }
}
