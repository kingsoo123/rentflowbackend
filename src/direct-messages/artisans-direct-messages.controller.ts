import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { ManagerArtisanDirectMessagesService } from './manager-artisan-direct-messages.service';

@Controller('artisans/direct-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ARTISAN)
export class ArtisansDirectMessagesController {
  constructor(
    private readonly managerArtisanDirectMessagesService: ManagerArtisanDirectMessagesService,
  ) {}

  @Get('threads')
  listThreads(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.managerArtisanDirectMessagesService.listThreadsForArtisan(req.user.sub);
  }

  @Get('threads/:threadId/messages')
  listMessages(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('threadId') threadId: string,
  ) {
    return this.managerArtisanDirectMessagesService.listMessagesForArtisan(req.user.sub, threadId);
  }

  @Post('threads/:threadId/messages')
  sendMessageInThread(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('threadId') threadId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.managerArtisanDirectMessagesService.sendFromArtisan(
      req.user.sub,
      threadId,
      dto.body,
    );
  }

  @Post('messages')
  sendMessage(@Req() req: Request & { user: JwtAccessPayload }, @Body() dto: SendDirectMessageDto) {
    return this.managerArtisanDirectMessagesService.sendFromArtisan(req.user.sub, '', dto.body);
  }
}
