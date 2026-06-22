import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { ManagersModule } from '../managers/managers.module';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { SecuredUploadsController } from './secured-uploads.controller';
import { SecuredUploadsService } from './secured-uploads.service';

@Module({
  imports: [
    AuthModule,
    ManagersModule,
    TypeOrmModule.forFeature([TenantPaymentConfirmation, MaintenanceRequest]),
  ],
  controllers: [SecuredUploadsController],
  providers: [SecuredUploadsService, JwtAuthGuard],
})
export class SecuredUploadsModule {}
