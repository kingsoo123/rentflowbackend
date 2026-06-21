import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { ManagersModule } from '../managers/managers.module';
import { MaintenanceRealtimeModule } from '../maintenance/maintenance-realtime.module';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { LeaseFormPdfService } from './lease-form-pdf.service';
import { ManagersLeaseFormsController } from './managers-lease-forms.controller';
import { TenantLeaseFormSubmission } from './tenant-lease-form-submission.entity';
import { TenantLeaseFormsController } from './tenant-lease-forms.controller';
import { TenantLeaseFormsService } from './tenant-lease-forms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantLeaseFormSubmission, User, TenantProfile]),
    AuthModule,
    ManagersModule,
    MaintenanceRealtimeModule,
    FirebaseModule,
  ],
  controllers: [TenantLeaseFormsController, ManagersLeaseFormsController],
  providers: [
    TenantLeaseFormsService,
    LeaseFormPdfService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class LeaseFormsModule {}
