import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import { NotifyTenantsManagerTaskDto } from './dto/notify-tenants-manager-task.dto';
import { ManagersTenantsService } from './managers-tenants.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersTaskNotificationsController {
  constructor(
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  @Post('notify-tenants')
  async notifyTenants(
    @Req() req: AuthedManagerRequest,
    @Body() dto: NotifyTenantsManagerTaskDto,
  ): Promise<{ notified: number }> {
    const managerId = req.user.sub;
    const tenantIds = dto.tenantIds?.length
      ? await this.filterTenantIdsOnRoster(managerId, dto.tenantIds)
      : await this.managersTenantsService.listTenantIdsOnManagerRoster(managerId, 200);

    if (tenantIds.length === 0) {
      return { notified: 0 };
    }

    const headline = dto.title.trim().slice(0, 280);
    const body = this.buildBody(dto);
    return this.tenantNotificationsService.createManagerTaskNotificationsForTenants({
      tenantIds,
      headline,
      body,
    });
  }

  private async filterTenantIdsOnRoster(
    managerId: string,
    ids: string[],
  ): Promise<string[]> {
    const out: string[] = [];
    const unique = [...new Set(ids)].slice(0, 150);
    for (const id of unique) {
      try {
        await this.managersTenantsService.assertTenantBelongsToManager(managerId, id);
        out.push(id);
      } catch {
        /* not on roster — skip */
      }
    }
    return out;
  }

  private buildBody(dto: NotifyTenantsManagerTaskDto): string {
    const parts: string[] = ['Your property manager added a task.'];
    if (dto.description?.trim()) {
      parts.push('', dto.description.trim());
    }
    if (dto.dueLabel?.trim()) {
      parts.push('', `Due: ${dto.dueLabel.trim()}`);
    }
    parts.push('', 'Open Alerts on your tenant dashboard for more details.');
    return parts.join('\n').slice(0, 4000);
  }
}
