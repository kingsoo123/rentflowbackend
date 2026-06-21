import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { DirectMessagesService } from './direct-messages.service';

@Controller('tenants/direct-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantsDirectMessagesController {
  constructor(private readonly directMessagesService: DirectMessagesService) {}

  @Get('threads')
  listThreads(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.directMessagesService.listThreadsForTenant(req.user.sub);
  }

  @Get('threads/:threadId/messages')
  listMessages(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('threadId') threadId: string,
  ) {
    return this.directMessagesService.listMessagesForTenant(req.user.sub, threadId);
  }

  @Post('threads/:threadId/messages')
  sendToThread(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('threadId') threadId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.directMessagesService.sendFromTenant(req.user.sub, threadId, dto.body);
  }

  /** Start or continue the primary manager conversation when no thread id exists yet. */
  @Post('messages')
  sendPrimary(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.directMessagesService.sendFromTenant(req.user.sub, '', dto.body);
  }
}
