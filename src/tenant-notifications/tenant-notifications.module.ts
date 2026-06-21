import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RentRenewalMailService } from '../email/rent-renewal-mail.service';
import { User } from '../users/user.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { ManagersTenantNotificationsController } from './managers-tenant-notifications.controller';
import { PropertyBroadcast } from './property-broadcast.entity';
import { TenantNotification } from './tenant-notification.entity';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { TenantNotificationsController } from './tenant-notifications.controller';
import { TenantNotificationsRealtimeGateway } from './tenant-notifications-realtime.gateway';
import { TenantNotificationsRealtimeService } from './tenant-notifications-realtime.service';
import { TenantNotificationsService } from './tenant-notifications.service';
import { TenantsProfileController } from './tenants-profile.controller';
import { TenantsUpcomingRentController } from './tenants-upcoming-rent.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { MaintenanceRealtimeModule } from '../maintenance/maintenance-realtime.module';

@Module({
  imports: [
    AuthModule,
    FirebaseModule,
    MaintenanceRealtimeModule,
    TypeOrmModule.forFeature([
      TenantNotification,
      PropertyBroadcast,
      User,
      TenantProfile,
      TenantPaymentConfirmation,
    ]),
  ],
  controllers: [
    ManagersTenantNotificationsController,
    TenantNotificationsController,
    TenantsProfileController,
    TenantsUpcomingRentController,
  ],
  providers: [
    TenantNotificationsService,
    TenantNotificationsRealtimeService,
    TenantNotificationsRealtimeGateway,
    RentRenewalMailService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [TenantNotificationsService, TenantNotificationsRealtimeService],
})
export class TenantNotificationsModule {}
