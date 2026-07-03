import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { ArtisanNotification } from './artisan-notification.entity';
import { ArtisanNotificationsRealtimeGateway } from './artisan-notifications-realtime.gateway';
import { ArtisanNotificationsRealtimeService } from './artisan-notifications-realtime.service';
import { ArtisanNotificationsService } from './artisan-notifications.service';
import { ArtisansNotificationsController } from './artisans-notifications.controller';
import { MaintenanceAssignment } from '../maintenance/maintenance-assignment.entity';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    AuthModule,
    FirebaseModule,
    TypeOrmModule.forFeature([
      ArtisanNotification,
      MaintenanceAssignment,
      MaintenanceRequest,
      User,
    ]),
  ],
  controllers: [ArtisansNotificationsController],
  providers: [
    ArtisanNotificationsService,
    ArtisanNotificationsRealtimeService,
    ArtisanNotificationsRealtimeGateway,
  ],
  exports: [ArtisanNotificationsService, ArtisanNotificationsRealtimeService],
})
export class ArtisanNotificationsModule {}
