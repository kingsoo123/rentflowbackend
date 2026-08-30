import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InspectionRecord } from '../inspections/inspection-record.entity';
import { LeaseAgreement } from '../leases/lease-agreement.entity';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { Property } from '../properties/property.entity';
import { PropertyBroadcast } from '../tenant-notifications/property-broadcast.entity';
import { TenantNotification } from '../tenant-notifications/tenant-notification.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';
import { AdminRealtimeModule } from './admin-realtime.module';
import { AdminService } from './admin.service';

@Module({
  imports: [
    AuthModule,
    AdminRealtimeModule,
    TypeOrmModule.forFeature([
      User,
      Property,
      LeaseAgreement,
      MaintenanceRequest,
      TenantPaymentConfirmation,
      PropertyBroadcast,
      TenantNotification,
      InspectionRecord,
      TenantProfile,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminBootstrapService, JwtAuthGuard, RolesGuard],
})
export class AdminModule {}
