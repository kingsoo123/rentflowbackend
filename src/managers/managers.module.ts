import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../uploads/cloudinary.module';
import { LeaseAgreement } from '../leases/lease-agreement.entity';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { Property } from '../properties/property.entity';
import { PropertyDocument } from '../properties/property-document.entity';
import { PropertyManagerAssignment } from '../properties/property-manager-assignment.entity';
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
    CloudinaryModule,
    MaintenanceAssignmentsModule,
    MaintenanceRealtimeModule,
    TenantNotificationsModule,
    TypeOrmModule.forFeature([
      User,
      TenantProfile,
      MaintenanceRequest,
      Property,
      PropertyUnit,
      PropertyDocument,
      PropertyManagerAssignment,
      TenantNotification,
      TenantPaymentConfirmation,
      ServiceChargeLine,
      ManagerArtisanRoster,
      LeaseAgreement,
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
