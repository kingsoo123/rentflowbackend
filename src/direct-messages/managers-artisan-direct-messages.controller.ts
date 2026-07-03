import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { ManagerArtisanDirectMessagesService } from './manager-artisan-direct-messages.service';

@Controller('managers/artisan-direct-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersArtisanDirectMessagesController {
  constructor(
    private readonly managerArtisanDirectMessagesService: ManagerArtisanDirectMessagesService,
  ) {}

  @Get('threads')
  listThreads(
    @Req() req: Request & { user: JwtAccessPayload },
    @Query('search') search?: string,
  ) {
    return this.managerArtisanDirectMessagesService.listThreadsForManager(req.user.sub, search);
  }

  @Get('threads/:artisanId/messages')
  listMessages(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('artisanId') artisanId: string,
  ) {
    return this.managerArtisanDirectMessagesService.listMessagesForManager(
      req.user.sub,
      artisanId,
    );
  }

  @Post('threads/:artisanId/messages')
  sendMessage(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('artisanId') artisanId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.managerArtisanDirectMessagesService.sendFromManager(
      req.user.sub,
      artisanId,
      dto.body,
    );
  }
}
