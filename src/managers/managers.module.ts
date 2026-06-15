import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { ManagersMaintenanceRequestsController } from './managers-maintenance-requests.controller';
import { ManagersMaintenanceRequestsService } from './managers-maintenance-requests.service';
import { ManagersPortfolioController } from './managers-portfolio.controller';
import { ManagersPortfolioService } from './managers-portfolio.service';
import { ManagersTenantsController } from './managers-tenants.controller';
import { ManagersTenantsService } from './managers-tenants.service';

@Module({
  imports: [
    AuthModule,
    TenantNotificationsModule,
    TypeOrmModule.forFeature([User, TenantProfile, MaintenanceRequest, Property]),
  ],
  controllers: [
    ManagersPortfolioController,
    ManagersTenantsController,
    ManagersMaintenanceRequestsController,
  ],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    ManagersPortfolioService,
    ManagersTenantsService,
    ManagersMaintenanceRequestsService,
  ],
  exports: [ManagersTenantsService],
})
export class ManagersModule {}
