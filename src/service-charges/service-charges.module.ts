import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Property } from '../properties/property.entity';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { MaintenanceRealtimeModule } from '../maintenance/maintenance-realtime.module';
import { ManagersPropertyServiceChargesController } from './managers-property-service-charges.controller';
import { ServiceChargeLine } from './service-charge-line.entity';
import { ServiceChargesService } from './service-charges.service';
import { TenantsServiceChargesController } from './tenants-service-charges.controller';

@Module({
  imports: [
    AuthModule,
    TenantNotificationsModule,
    MaintenanceRealtimeModule,
    TypeOrmModule.forFeature([ServiceChargeLine, Property]),
  ],
  controllers: [ManagersPropertyServiceChargesController, TenantsServiceChargesController],
  providers: [ServiceChargesService, JwtAuthGuard, RolesGuard],
  exports: [ServiceChargesService],
})
export class ServiceChargesModule {}
