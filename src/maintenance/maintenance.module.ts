import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagersModule } from '../managers/managers.module';
import { MaintenanceRequest } from './maintenance-request.entity';
import { MaintenanceRealtimeGateway } from './maintenance-realtime.gateway';
import { MaintenanceRealtimeService } from './maintenance-realtime.service';
import { TenantMaintenanceRequestsController } from './tenant-maintenance-requests.controller';
import { TenantMaintenanceRequestsService } from './tenant-maintenance-requests.service';

@Module({
  imports: [AuthModule, ManagersModule, TypeOrmModule.forFeature([MaintenanceRequest])],
  controllers: [TenantMaintenanceRequestsController],
  providers: [
    TenantMaintenanceRequestsService,
    MaintenanceRealtimeService,
    MaintenanceRealtimeGateway,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [TenantMaintenanceRequestsService],
})
export class MaintenanceModule {}
