import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { MaintenanceAssignmentsService } from '../maintenance/maintenance-assignments.service';
import { ArtisanNotificationsService } from './artisan-notifications.service';
import { ArtisansService } from './artisans.service';

type AuthedArtisanRequest = Request & { user: JwtAccessPayload };

@Controller('artisans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ARTISAN)
export class ArtisansController {
  constructor(
    private readonly artisansService: ArtisansService,
    private readonly maintenanceAssignmentsService: MaintenanceAssignmentsService,
    private readonly artisanNotificationsService: ArtisanNotificationsService,
  ) {}

  @Get('profile')
  async profile(@Req() req: AuthedArtisanRequest) {
    const summary = await this.artisansService.getProfile(req.user.sub);
    const assignments = await this.maintenanceAssignmentsService.listForArtisan(
      req.user.sub,
    );
    const activeMaintenanceCount = assignments.filter(
      (a) => a.assignmentStatus === 'pending' || a.assignmentStatus === 'accepted',
    ).length;
    const pendingAssignmentCount = assignments.filter(
      (a) => a.assignmentStatus === 'pending',
    ).length;
    return { ...summary, activeMaintenanceCount, pendingAssignmentCount };
  }

  @Get('maintenance-requests')
  listMaintenance(@Req() req: AuthedArtisanRequest) {
    return this.artisansService.listMaintenanceRequests(req.user.sub);
  }

  @Get('assignments')
  async listAssignments(@Req() req: AuthedArtisanRequest) {
    const rows = await this.maintenanceAssignmentsService.listForArtisan(req.user.sub);
    await this.artisanNotificationsService.backfillMissingAssignmentNotifications(req.user.sub);
    return rows;
  }

  @Post('assignments/:id/accept')
  acceptAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedArtisanRequest,
  ) {
    return this.maintenanceAssignmentsService.acceptAssignment(req.user.sub, id);
  }
}
