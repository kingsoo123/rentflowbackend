import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { TenantPaymentConfirmationsService } from './tenant-payment-confirmations.service';

@Controller('managers/payment-confirmations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersPaymentConfirmationsController {
  constructor(
    private readonly tenantPaymentConfirmationsService: TenantPaymentConfirmationsService,
  ) {}

  @Get()
  list(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.listForManager(req.user.sub);
  }

  @Get('collected-mtd')
  collectedMtd(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.getCollectedMtdForManager(req.user.sub);
  }

  @Get('scheduled-mtd')
  scheduledMtd(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.getScheduledMtdForManager(req.user.sub);
  }

  @Get('closed-last-month')
  closedLastMonth(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.getClosedLastMonthForManager(req.user.sub);
  }

  @Patch(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tenantPaymentConfirmationsService.confirmForManager(req.user.sub, id);
  }
}
