import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MaintenanceAssignmentsModule } from '../maintenance/maintenance-assignments.module';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { ManagerArtisanRoster } from '../managers/manager-artisan-roster.entity';
import { User } from '../users/user.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { ArtisanNotificationsModule } from './artisan-notifications.module';
import { ArtisansController } from './artisans.controller';
import { ArtisansService } from './artisans.service';

@Module({
  imports: [
    AuthModule,
    ArtisanNotificationsModule,
    MaintenanceAssignmentsModule,
    TypeOrmModule.forFeature([User, ManagerArtisanRoster, MaintenanceRequest, TenantProfile]),
  ],
  controllers: [ArtisansController],
  providers: [ArtisansService],
  exports: [ArtisansService],
})
export class ArtisansModule {}
