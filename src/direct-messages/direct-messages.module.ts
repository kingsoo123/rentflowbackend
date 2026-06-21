import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagersModule } from '../managers/managers.module';
import { User } from '../users/user.entity';
import { DirectMessage } from './direct-message.entity';
import { DirectMessageThread } from './direct-message-thread.entity';
import {
  ManagerDirectMessagesGateway,
  TenantDirectMessagesGateway,
} from './direct-messages-realtime.gateway';
import { DirectMessagesRealtimeService } from './direct-messages-realtime.service';
import { DirectMessagesService } from './direct-messages.service';
import { ManagersDirectMessagesController } from './managers-direct-messages.controller';
import { TenantsDirectMessagesController } from './tenants-direct-messages.controller';

@Module({
  imports: [
    AuthModule,
    ManagersModule,
    TypeOrmModule.forFeature([DirectMessageThread, DirectMessage, User]),
  ],
  controllers: [ManagersDirectMessagesController, TenantsDirectMessagesController],
  providers: [
    DirectMessagesService,
    DirectMessagesRealtimeService,
    ManagerDirectMessagesGateway,
    TenantDirectMessagesGateway,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [DirectMessagesService, DirectMessagesRealtimeService],
})
export class DirectMessagesModule {}
