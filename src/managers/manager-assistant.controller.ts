import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { ManagerChatMessageDto } from './dto/manager-chat-message.dto';
import { ManagerAssistantService } from './manager-assistant.service';

@Controller('managers/assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagerAssistantController {
  constructor(private readonly managerAssistantService: ManagerAssistantService) {}

  @Post('chat')
  chat(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: ManagerChatMessageDto,
  ) {
    return this.managerAssistantService.reply(req.user.sub, dto.message);
  }
}
