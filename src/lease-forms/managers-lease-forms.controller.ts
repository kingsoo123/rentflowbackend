import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { TenantLeaseFormsService } from './tenant-lease-forms.service';

@Controller('managers/lease-form-submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersLeaseFormsController {
  constructor(private readonly tenantLeaseFormsService: TenantLeaseFormsService) {}

  @Get()
  list(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantLeaseFormsService.listForManager(req.user.sub);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.tenantLeaseFormsService.buildPdfForManager(req.user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lease-form-${id}.pdf"`,
    );
    res.send(buf);
  }
}
