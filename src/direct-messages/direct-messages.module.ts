import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerArtisanRoster } from '../managers/manager-artisan-roster.entity';
import { ManagersModule } from '../managers/managers.module';
import { User } from '../users/user.entity';
import { ArtisansDirectMessagesController } from './artisans-direct-messages.controller';
import { DirectMessage } from './direct-message.entity';
import { DirectMessageThread } from './direct-message-thread.entity';
import {
  ArtisanDirectMessagesGateway,
  ManagerDirectMessagesGateway,
  TenantDirectMessagesGateway,
} from './direct-messages-realtime.gateway';
import { DirectMessagesRealtimeService } from './direct-messages-realtime.service';
import { DirectMessagesService } from './direct-messages.service';
import { ManagerArtisanDirectMessage } from './manager-artisan-direct-message.entity';
import { ManagerArtisanDirectMessageThread } from './manager-artisan-direct-message-thread.entity';
import { ManagerArtisanDirectMessagesService } from './manager-artisan-direct-messages.service';
import { ManagersArtisanDirectMessagesController } from './managers-artisan-direct-messages.controller';
import { ManagersDirectMessagesController } from './managers-direct-messages.controller';
import { TenantsDirectMessagesController } from './tenants-direct-messages.controller';

@Module({
  imports: [
    AuthModule,
    ManagersModule,
    TypeOrmModule.forFeature([
      DirectMessageThread,
      DirectMessage,
      ManagerArtisanDirectMessageThread,
      ManagerArtisanDirectMessage,
      ManagerArtisanRoster,
      User,
    ]),
  ],
  controllers: [
    ManagersDirectMessagesController,
    TenantsDirectMessagesController,
    ManagersArtisanDirectMessagesController,
    ArtisansDirectMessagesController,
  ],
  providers: [
    DirectMessagesService,
    ManagerArtisanDirectMessagesService,
    DirectMessagesRealtimeService,
    ManagerDirectMessagesGateway,
    TenantDirectMessagesGateway,
    ArtisanDirectMessagesGateway,
  ],
  exports: [DirectMessagesService, ManagerArtisanDirectMessagesService, DirectMessagesRealtimeService],
})
export class DirectMessagesModule {}
