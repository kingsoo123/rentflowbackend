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
import { TenantNotificationsController } from './tenant-notifications.controller';
import { TenantNotificationsRealtimeGateway } from './tenant-notifications-realtime.gateway';
import { TenantNotificationsRealtimeService } from './tenant-notifications-realtime.service';
import { TenantNotificationsService } from './tenant-notifications.service';
import { TenantsProfileController } from './tenants-profile.controller';
import { TenantsUpcomingRentController } from './tenants-upcoming-rent.controller';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      TenantNotification,
      PropertyBroadcast,
      User,
      TenantProfile,
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
  exports: [TenantNotificationsService],
})
export class TenantNotificationsModule {}
