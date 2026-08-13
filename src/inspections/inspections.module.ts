import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagersModule } from '../managers/managers.module';
import { Property } from '../properties/property.entity';
import { TenantNotificationsModule } from '../tenant-notifications/tenant-notifications.module';
import { CloudinaryModule } from '../uploads/cloudinary.module';
import { User } from '../users/user.entity';
import { InspectionRecord } from './inspection-record.entity';
import { InspectionsService } from './inspections.service';
import { ManagersInspectionsController } from './managers-inspections.controller';
import { TenantInspectionsController } from './tenant-inspections.controller';

@Module({
  imports: [
    AuthModule,
    ManagersModule,
    TenantNotificationsModule,
    CloudinaryModule,
    TypeOrmModule.forFeature([InspectionRecord, Property, User]),
  ],
  controllers: [ManagersInspectionsController, TenantInspectionsController],
  providers: [InspectionsService, JwtAuthGuard, RolesGuard],
  exports: [InspectionsService],
})
export class InspectionsModule {}
