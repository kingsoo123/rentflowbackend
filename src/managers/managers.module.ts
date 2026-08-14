import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { Property } from '../properties/property.entity';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { ServiceChargeLine } from '../service-charges/service-charge-line.entity';
import { TenantNotification } from '../tenant-notifications/tenant-notification.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { PropertyUnit } from '../properties/property-unit.entity';
import { MaintenanceAssignmentsModule } from '../maintenance/maintenance-assignments.module';
import { MaintenanceRealtimeModule } from '../maintenance/maintenance-realtime.module';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { ManagersMaintenanceRequestsController } from './managers-maintenance-requests.controller';
import { ManagersMaintenanceRequestsService } from './managers-maintenance-requests.service';
import { ManagerAssistantController } from './manager-assistant.controller';
import { ManagerAssistantService } from './manager-assistant.service';
import { ManagersPortfolioController } from './managers-portfolio.controller';
import { ManagersPortfolioService } from './managers-portfolio.service';
import { ManagersTaskNotificationsController } from './managers-task-notifications.controller';
import { ManagersTenantsController } from './managers-tenants.controller';
import { ManagersTenantsService } from './managers-tenants.service';
import { ManagersUnitsService } from './managers-units.service';
import { ManagerArtisanRoster } from './manager-artisan-roster.entity';
import { ManagersArtisansController } from './managers-artisans.controller';
import { ManagersArtisansService } from './managers-artisans.service';

@Module({
  imports: [
    AuthModule,
    MaintenanceAssignmentsModule,
    MaintenanceRealtimeModule,
    TenantNotificationsModule,
    TypeOrmModule.forFeature([
      User,
      TenantProfile,
      MaintenanceRequest,
      Property,
      PropertyUnit,
      TenantNotification,
      TenantPaymentConfirmation,
      ServiceChargeLine,
      ManagerArtisanRoster,
    ]),
  ],
  controllers: [
    ManagersPortfolioController,
    ManagersTenantsController,
    ManagersArtisansController,
    ManagersMaintenanceRequestsController,
    ManagersTaskNotificationsController,
    ManagerAssistantController,
  ],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    ManagersPortfolioService,
    ManagersTenantsService,
    ManagersUnitsService,
    ManagersArtisansService,
    ManagersMaintenanceRequestsService,
    ManagerAssistantService,
  ],
  exports: [ManagersTenantsService, ManagersUnitsService],
})
export class ManagersModule {}
