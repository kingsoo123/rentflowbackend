import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaintenanceRealtimeGateway } from './maintenance-realtime.gateway';
import { MaintenanceRealtimeService } from './maintenance-realtime.service';

/** Socket.IO bridge for manager live updates — no ManagersModule dependency (avoids import cycles). */
@Module({
  imports: [AuthModule],
  providers: [MaintenanceRealtimeService, MaintenanceRealtimeGateway],
  exports: [MaintenanceRealtimeService],
})
export class MaintenanceRealtimeModule {}
