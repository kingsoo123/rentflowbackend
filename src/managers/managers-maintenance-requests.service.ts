import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { MaintenanceRequestStatus } from '../maintenance/maintenance-request-status.enum';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import { User } from '../users/user.entity';

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
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  /** All tenant-submitted maintenance rows (newest first) for manager triage. */
  async listAllForManagers(): Promise<ManagerMaintenanceRequestRow[]> {
    const rows = await this.maintenanceRepository.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
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
    id: string,
    status: MaintenanceRequestStatus,
  ): Promise<ManagerMaintenanceRequestRow> {
    const row = await this.maintenanceRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Maintenance request not found');
    }
    const previousStatus = row.status;
    row.status = status;
    const saved = await this.maintenanceRepository.save(row);

    if (previousStatus !== status) {
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
