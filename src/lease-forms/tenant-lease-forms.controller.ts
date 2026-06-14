import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { SubmitLeaseFormDto } from './dto/submit-lease-form.dto';
import { TenantLeaseFormsService } from './tenant-lease-forms.service';

@Controller('tenants/lease-forms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantLeaseFormsController {
  constructor(private readonly tenantLeaseFormsService: TenantLeaseFormsService) {}

  @Get('templates')
  templates() {
    return this.tenantLeaseFormsService.listTemplates();
  }

  @Get('my-submissions')
  mySubmissions(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantLeaseFormsService.listMySubmissions(req.user.sub);
  }

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: SubmitLeaseFormDto,
  ) {
    return this.tenantLeaseFormsService.submit(req.user.sub, dto);
  }

  @Get('submissions/:id/pdf')
  async downloadPdf(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.tenantLeaseFormsService.buildPdfForTenant(req.user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lease-form-${id}.pdf"`,
    );
    res.send(buf);
  }
}
