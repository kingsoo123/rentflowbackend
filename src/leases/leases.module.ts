import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { ManagersModule } from '../managers/managers.module';
import { MaintenanceRealtimeModule } from '../maintenance/maintenance-realtime.module';
import { Property } from '../properties/property.entity';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { LeaseAgreement } from './lease-agreement.entity';
import { LeasePdfService } from './lease-pdf.service';
import { LeasesService } from './leases.service';
import { ManagersLeasesController } from './managers-leases.controller';
import { TenantLeasesController } from './tenant-leases.controller';

@Module({
  imports: [
    AuthModule,
    ManagersModule,
    TenantNotificationsModule,
    MaintenanceRealtimeModule,
    FirebaseModule,
    TypeOrmModule.forFeature([LeaseAgreement, Property, User, TenantProfile]),
  ],
  controllers: [ManagersLeasesController, TenantLeasesController],
  providers: [LeasesService, LeasePdfService],
  exports: [LeasesService],
})
export class LeasesModule {}
