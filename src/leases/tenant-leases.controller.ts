import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SignLeaseDto } from './dto/lease.dto';
import { LeasesService } from './leases.service';

type AuthedTenantRequest = Request & { user: JwtAccessPayload };

@Controller('tenants/leases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantLeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Get()
  list(@Req() req: AuthedTenantRequest) {
    return this.leasesService.listForTenant(req.user.sub);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedTenantRequest,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.leasesService.pdfForTenant(req.user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lease-${id}.pdf"`,
    );
    res.send(buf);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedTenantRequest,
  ) {
    return this.leasesService.getForTenant(req.user.sub, id);
  }

  @Post(':id/sign')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignLeaseDto,
    @Req() req: AuthedTenantRequest,
  ) {
    return this.leasesService.signForTenant(req.user.sub, id, dto);
  }
}
