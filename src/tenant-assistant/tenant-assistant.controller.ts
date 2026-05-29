import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { TenantChatMessageDto } from './dto/tenant-chat-message.dto';
import { TenantAssistantService } from './tenant-assistant.service';

@Controller('tenants/assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantAssistantController {
  constructor(private readonly tenantAssistantService: TenantAssistantService) {}

  @Post('chat')
  chat(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: TenantChatMessageDto,
  ) {
    return this.tenantAssistantService.reply(req.user.sub, dto.message);
  }
}
