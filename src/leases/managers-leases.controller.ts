import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  CreateLeaseDto,
  RenewLeaseDto,
  SignLeaseDto,
  TerminateLeaseDto,
  UpdateLeaseDto,
} from './dto/lease.dto';
import { LeasesService } from './leases.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/leases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersLeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Get()
  list(@Req() req: AuthedManagerRequest) {
    return this.leasesService.listForManager(req.user.sub);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedManagerRequest,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.leasesService.pdfForManager(req.user.sub, id);
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
    @Req() req: AuthedManagerRequest,
  ) {
    return this.leasesService.getForManager(req.user.sub, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthedManagerRequest, @Body() dto: CreateLeaseDto) {
    return this.leasesService.createForManager(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaseDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.leasesService.updateForManager(req.user.sub, id, dto);
  }

  @Post(':id/send-for-signature')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.leasesService.sendForSignature(req.user.sub, id);
  }

  @Post(':id/countersign')
  countersign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignLeaseDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.leasesService.countersignForManager(req.user.sub, id, dto);
  }

  @Post(':id/terminate')
  terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateLeaseDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.leasesService.terminateForManager(req.user.sub, id, dto);
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.CREATED)
  renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewLeaseDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.leasesService.renewForManager(req.user.sub, id, dto);
  }
}
