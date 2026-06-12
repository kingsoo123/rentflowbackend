import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { PutServiceChargesDto } from './dto/put-service-charges.dto';
import { ServiceChargesService } from './service-charges.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/properties')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersPropertyServiceChargesController {
  constructor(private readonly serviceChargesService: ServiceChargesService) {}

  @Get(':propertyId/service-charges')
  list(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.serviceChargesService.listForProperty(req.user.sub, propertyId);
  }

  @Put(':propertyId/service-charges')
  replace(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: PutServiceChargesDto,
  ) {
    return this.serviceChargesService.replaceForProperty(req.user.sub, propertyId, dto);
  }
}
