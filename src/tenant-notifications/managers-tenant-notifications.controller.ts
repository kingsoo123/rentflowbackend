import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import {
  mergeRentRenewalRecipientEmails,
  SendRentRenewalNoticeDto,
} from './dto/send-rent-renewal-notice.dto';
import { TenantNotificationsService } from './tenant-notifications.service';

const MAX_RENT_RENEWAL_RECIPIENTS = 25;

@Controller('managers/tenant-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagersTenantNotificationsController {
  constructor(
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  @Post('rent-renewal')
  @Roles(UserRole.PROPERTY_MANAGER)
  async sendRentRenewal(@Body() dto: SendRentRenewalNoticeDto) {
    const tenantEmails = mergeRentRenewalRecipientEmails(dto);
    if (tenantEmails.length === 0) {
      throw new BadRequestException(
        'Provide at least one tenant email using tenantEmail and/or tenantEmails.',
      );
    }
    if (tenantEmails.length > MAX_RENT_RENEWAL_RECIPIENTS) {
      throw new BadRequestException(
        `At most ${MAX_RENT_RENEWAL_RECIPIENTS} recipient emails per request.`,
      );
    }
    const result = await this.tenantNotificationsService.sendRentRenewalNotices({
      tenantEmails,
      noticeBody: dto.noticeBody,
      headline: dto.headline,
      renewalMonthlyRentDisplay: dto.renewalMonthlyRentDisplay,
      renewalEffectiveDate: dto.renewalEffectiveDate,
    });
    if (result.delivered.length === 1 && result.failed.length === 0) {
      const d = result.delivered[0];
      return {
        ...result,
        id: d.notificationId,
        tenantId: d.tenantId,
        emailSent: d.emailSent,
        emailSkipped: d.emailSkipped,
      };
    }
    return result;
  }
}
