import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreatePropertyUnitDto } from './dto/create-property-unit.dto';
import { UpdatePropertyUnitDto } from './dto/update-property-unit.dto';
import { ManagersPortfolioService } from './managers-portfolio.service';
import { ManagersUnitsService } from './managers-units.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagersPortfolioController {
  constructor(
    private readonly managersPortfolioService: ManagersPortfolioService,
    private readonly managersUnitsService: ManagersUnitsService,
  ) {}

  @Get('properties')
  @Roles(UserRole.PROPERTY_MANAGER)
  async properties(@Req() req: AuthedManagerRequest) {
    const properties = await this.managersPortfolioService.listPropertiesForManager(
      req.user.sub,
    );
    return { properties };
  }

  @Post('properties')
  @Roles(UserRole.PROPERTY_MANAGER)
  async createProperty(
    @Req() req: AuthedManagerRequest,
    @Body() dto: CreatePropertyDto,
  ) {
    const property = await this.managersPortfolioService.createProperty(req.user.sub, dto);
    return { property };
  }

  @Patch('properties/:propertyId')
  @Roles(UserRole.PROPERTY_MANAGER)
  async updateProperty(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    const property = await this.managersPortfolioService.updateProperty(
      req.user.sub,
      propertyId,
      dto,
    );
    return { property };
  }

  @Delete('properties/:propertyId')
  @Roles(UserRole.PROPERTY_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProperty(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    await this.managersPortfolioService.deleteProperty(req.user.sub, propertyId);
  }

  @Get('portfolio-summary')
  @Roles(UserRole.PROPERTY_MANAGER)
  portfolioSummary(@Req() req: AuthedManagerRequest) {
    return this.managersPortfolioService.getPortfolioSummary(req.user.sub);
  }

  @Get('properties/:propertyId/units')
  @Roles(UserRole.PROPERTY_MANAGER)
  async listUnits(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    const units = await this.managersUnitsService.listUnitsForProperty(
      req.user.sub,
      propertyId,
    );
    return { units };
  }

  @Post('properties/:propertyId/units')
  @Roles(UserRole.PROPERTY_MANAGER)
  async createUnit(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreatePropertyUnitDto,
  ) {
    const unit = await this.managersUnitsService.createUnit(
      req.user.sub,
      propertyId,
      dto,
    );
    return { unit };
  }

  @Patch('properties/:propertyId/units/:unitId')
  @Roles(UserRole.PROPERTY_MANAGER)
  async updateUnit(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: UpdatePropertyUnitDto,
  ) {
    const unit = await this.managersUnitsService.updateUnit(
      req.user.sub,
      propertyId,
      unitId,
      dto,
    );
    return { unit };
  }

  @Delete('properties/:propertyId/units/:unitId')
  @Roles(UserRole.PROPERTY_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUnit(
    @Req() req: AuthedManagerRequest,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    await this.managersUnitsService.deleteUnit(req.user.sub, propertyId, unitId);
  }
}
