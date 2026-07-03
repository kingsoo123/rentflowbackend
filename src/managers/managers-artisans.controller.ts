import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CreateArtisanDto } from '../auth/dto/create-artisan.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { LookupArtisanEmailQueryDto } from './dto/lookup-artisan-email.query.dto';
import { ManagersArtisansService } from './managers-artisans.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/artisans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersArtisansController {
  constructor(private readonly managersArtisansService: ManagersArtisansService) {}

  @Get()
  list(@Req() req: AuthedManagerRequest) {
    return this.managersArtisansService.listForManager(req.user.sub);
  }

  @Get('lookup-email')
  lookupEmail(@Query() query: LookupArtisanEmailQueryDto) {
    return this.managersArtisansService.checkArtisanEmailRegistered(query.email);
  }

  @Post()
  async create(
    @Body() dto: CreateArtisanDto,
    @Req() req: AuthedManagerRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.managersArtisansService.assertProfilePropertiesAllowed(
      req.user.sub,
      dto.profile && typeof dto.profile === 'object' && !Array.isArray(dto.profile)
        ? (dto.profile as Record<string, unknown>)
        : undefined,
    );
    const { user, updated } = await this.managersArtisansService.addArtisanToRoster(
      req.user.sub,
      dto,
    );
    res.status(updated ? HttpStatus.OK : HttpStatus.CREATED);
    return user;
  }
}
