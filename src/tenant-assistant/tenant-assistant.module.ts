import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { User } from '../users/user.entity';
import { TenantAssistantController } from './tenant-assistant.controller';
import { TenantAssistantService } from './tenant-assistant.service';

@Module({
  imports: [
    AuthModule,
    MaintenanceModule,
    TenantNotificationsModule,
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [TenantAssistantController],
  providers: [TenantAssistantService, JwtAuthGuard, RolesGuard],
})
export class TenantAssistantModule {}
