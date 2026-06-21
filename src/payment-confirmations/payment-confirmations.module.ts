import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { ServiceChargesModule } from '../service-charges/service-charges.module';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { ManagersModule } from '../managers/managers.module';
import { MaintenanceRealtimeModule } from '../maintenance/maintenance-realtime.module';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { ManagersPaymentConfirmationsController } from './managers-payment-confirmations.controller';
import { PaymentReceiptPdfService } from './payment-receipt-pdf.service';
import { TenantPaymentConfirmation } from './tenant-payment-confirmation.entity';
import { TenantPaymentConfirmationsController } from './tenant-payment-confirmations.controller';
import { TenantPaymentConfirmationsService } from './tenant-payment-confirmations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantPaymentConfirmation, Property, User, TenantProfile]),
    AuthModule,
    ManagersModule,
    MaintenanceRealtimeModule,
    FirebaseModule,
    TenantNotificationsModule,
    ServiceChargesModule,
  ],
  controllers: [TenantPaymentConfirmationsController, ManagersPaymentConfirmationsController],
  providers: [
    TenantPaymentConfirmationsService,
    PaymentReceiptPdfService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class PaymentConfirmationsModule {}
