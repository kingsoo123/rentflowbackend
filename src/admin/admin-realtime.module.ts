import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { AdminRealtimeService } from './admin-realtime.service';

/**
 * Isolated from AdminModule so AuthModule can import it without a cycle
 * (AdminModule → AuthModule → AdminRealtimeModule → AuthModule).
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [AdminRealtimeService, AdminRealtimeGateway],
  exports: [AdminRealtimeService],
})
export class AdminRealtimeModule {}
