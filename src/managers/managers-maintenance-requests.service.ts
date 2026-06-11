import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { MaintenanceRequestStatus } from '../maintenance/maintenance-request-status.enum';
import { Property } from '../properties/property.entity';
import { TenantNotificationsRealtimeService } from '../tenant-notifications/tenant-notifications-realtime.service';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { ManagersTenantsService } from './managers-tenants.service';

export type ManagerMaintenanceRequestRow = {
  id: string;
  title: string;
  description: string;
  urgency: string;
  status: string;
  attachmentUrls: string[];
  createdAt: Date;
  updatedAt: Date;
  tenantFullName: string;
  tenantEmail: string;
};

@Injectable()
export class ManagersMaintenanceRequestsService {
  private readonly logger = new Logger(ManagersMaintenanceRequestsService.name);

  constructor(
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly tenantNotificationsService: TenantNotificationsService,
    private readonly tenantNotificationsRealtime: TenantNotificationsRealtimeService,
  ) {}

  /**
   * Tenant-submitted maintenance for this manager's occupancy roster only
   * (same scope as `GET /api/managers/tenants`), newest first.
   */
  async listForManager(managerUserId: string): Promise<ManagerMaintenanceRequestRow[]> {
    const rows = await this.maintenanceRepository
      .createQueryBuilder('mr')
      .innerJoin(User, 'u', 'u.id = mr.tenantId AND u.role = :role', {
        role: UserRole.TENANT,
      })
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .innerJoin(
        Property,
        'p',
        `p.managerUserId = :managerUserId AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))`,
        { managerUserId },
      )
      .orderBy('mr.createdAt', 'DESC')
      .take(100)
      .getMany();
    if (rows.length === 0) {
      return [];
    }
    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const tenants = await this.usersRepository.find({
      where: { id: In(tenantIds) },
    });
    const byId = new Map(tenants.map((u) => [u.id, u]));
    return rows.map((r) => this.toRow(r, byId));
  }

  async updateStatus(
    managerUserId: string,
    id: string,
    status: MaintenanceRequestStatus,
  ): Promise<ManagerMaintenanceRequestRow> {
    const row = await this.maintenanceRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Maintenance request not found');
    }
    await this.managersTenantsService.assertTenantBelongsToManager(
      managerUserId,
      row.tenantId,
    );
    const previousStatus = row.status;
    row.status = status;
    const saved = await this.maintenanceRepository.save(row);

    if (previousStatus !== status) {
      this.tenantNotificationsRealtime.notifyMaintenanceUpdated(saved.tenantId, {
        id: saved.id,
      });
      try {
        await this.tenantNotificationsService.createMaintenanceStatusNotification({
          tenantId: saved.tenantId,
          title: saved.title,
          previousStatus,
          newStatus: status,
        });
      } catch (err) {
        this.logger.warn(
          `Could not create tenant notification for maintenance ${saved.id} status change`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    const tenants = await this.usersRepository.find({
      where: { id: saved.tenantId },
    });
    const byId = new Map(tenants.map((u) => [u.id, u]));
    return this.toRow(saved, byId);
  }

  private toRow(
    r: MaintenanceRequest,
    tenantById: Map<string, User>,
  ): ManagerMaintenanceRequestRow {
    const u = tenantById.get(r.tenantId);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      urgency: r.urgency,
      status: r.status,
      attachmentUrls: Array.isArray(r.attachmentUrls) ? r.attachmentUrls : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tenantFullName: u?.fullName ?? 'Unknown tenant',
      tenantEmail: u?.email ?? '',
    };
  }
}
