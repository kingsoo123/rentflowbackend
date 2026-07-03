import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtisanNotificationsModule } from '../artisans/artisan-notifications.module';
import { ManagerArtisanRoster } from '../managers/manager-artisan-roster.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { MaintenanceAssignment } from './maintenance-assignment.entity';
import { MaintenanceAssignmentsService } from './maintenance-assignments.service';
import { MaintenanceRequest } from './maintenance-request.entity';

@Module({
  imports: [
    ArtisanNotificationsModule,
    TypeOrmModule.forFeature([
      MaintenanceAssignment,
      MaintenanceRequest,
      ManagerArtisanRoster,
      User,
      TenantProfile,
    ]),
  ],
  providers: [MaintenanceAssignmentsService],
  exports: [MaintenanceAssignmentsService],
})
export class MaintenanceAssignmentsModule {}
