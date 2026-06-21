import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { DirectMessagesService } from './direct-messages.service';

@Controller('managers/direct-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersDirectMessagesController {
  constructor(private readonly directMessagesService: DirectMessagesService) {}

  @Get('threads')
  listThreads(
    @Req() req: Request & { user: JwtAccessPayload },
    @Query('search') search?: string,
  ) {
    return this.directMessagesService.listThreadsForManager(req.user.sub, search);
  }

  @Get('threads/:tenantId/messages')
  listMessages(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('tenantId') tenantId: string,
  ) {
    return this.directMessagesService.listMessagesForManager(req.user.sub, tenantId);
  }

  @Post('threads/:tenantId/messages')
  sendMessage(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('tenantId') tenantId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.directMessagesService.sendFromManager(req.user.sub, tenantId, dto.body);
  }
}
