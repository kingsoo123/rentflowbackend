import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagersModule } from '../managers/managers.module';
import { MaintenanceRequest } from './maintenance-request.entity';
import { MaintenanceRealtimeModule } from './maintenance-realtime.module';
import { TenantMaintenanceRequestsController } from './tenant-maintenance-requests.controller';
import { TenantMaintenanceRequestsService } from './tenant-maintenance-requests.service';

@Module({
  imports: [
    AuthModule,
    ManagersModule,
    MaintenanceRealtimeModule,
    TypeOrmModule.forFeature([MaintenanceRequest]),
  ],
  controllers: [TenantMaintenanceRequestsController],
  providers: [TenantMaintenanceRequestsService, JwtAuthGuard, RolesGuard],
  exports: [TenantMaintenanceRequestsService, MaintenanceRealtimeModule],
})
export class MaintenanceModule {}
