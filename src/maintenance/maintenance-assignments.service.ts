import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArtisanNotificationsService } from '../artisans/artisan-notifications.service';
import { ArtisanNotificationsRealtimeService } from '../artisans/artisan-notifications-realtime.service';
import { ManagerArtisanRoster } from '../managers/manager-artisan-roster.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { MaintenanceAssignment } from './maintenance-assignment.entity';
import {
  MAINTENANCE_ASSIGNMENT_ACCEPT_HOURS,
  MaintenanceAssignmentStatus,
} from './maintenance-assignment-status.enum';
import { MaintenanceRequest } from './maintenance-request.entity';
import { MaintenanceRequestStatus } from './maintenance-request-status.enum';

export type MaintenanceAssignmentSummary = {
  id: string;
  artisanUserId: string;
  artisanFullName: string;
  artisanEmail: string;
  status: MaintenanceAssignmentStatus;
  assignedAt: string;
  acceptBy: string;
  respondedAt: string | null;
};

export type ArtisanAssignmentRow = {
  id: string;
  maintenanceRequestId: string;
  title: string;
  description: string;
  urgency: string;
  maintenanceStatus: string;
  propertyAssigned: string | null;
  tenantFullName: string;
  managerName: string;
  assignmentStatus: MaintenanceAssignmentStatus;
  assignedAt: string;
  acceptBy: string;
  respondedAt: string | null;
  attachmentUrls: string[];
};

@Injectable()
export class MaintenanceAssignmentsService {
  private readonly logger = new Logger(MaintenanceAssignmentsService.name);

  constructor(
    @InjectRepository(MaintenanceAssignment)
    private readonly assignmentRepository: Repository<MaintenanceAssignment>,
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    @InjectRepository(ManagerArtisanRoster)
    private readonly rosterRepository: Repository<ManagerArtisanRoster>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    private readonly artisanNotificationsService: ArtisanNotificationsService,
    private readonly artisanNotificationsRealtime: ArtisanNotificationsRealtimeService,
  ) {}

  acceptDeadlineFrom(assignedAt: Date): Date {
    return new Date(
      assignedAt.getTime() + MAINTENANCE_ASSIGNMENT_ACCEPT_HOURS * 60 * 60 * 1000,
    );
  }

  async expireStalePendingAssignments(ids?: string[]): Promise<void> {
    const now = new Date();
    const qb = this.assignmentRepository
      .createQueryBuilder()
      .update(MaintenanceAssignment)
      .set({ status: MaintenanceAssignmentStatus.EXPIRED, respondedAt: now })
      .where('status = :pending', { pending: MaintenanceAssignmentStatus.PENDING })
      .andWhere('accept_by < :now', { now });
    if (ids?.length) {
      qb.andWhere('id IN (:...ids)', { ids });
    }
    await qb.execute();
  }

  async getLatestAssignmentForRequests(
    requestIds: string[],
  ): Promise<Map<string, MaintenanceAssignmentSummary>> {
    if (requestIds.length === 0) {
      return new Map();
    }
    await this.expireStalePendingForRequests(requestIds);

    const rows = await this.assignmentRepository.find({
      where: { maintenanceRequestId: In(requestIds) },
      order: { assignedAt: 'DESC' },
    });
    const latestByRequest = new Map<string, MaintenanceAssignment>();
    for (const row of rows) {
      if (!latestByRequest.has(row.maintenanceRequestId)) {
        latestByRequest.set(row.maintenanceRequestId, row);
      }
    }

    const artisanIds = [...new Set([...latestByRequest.values()].map((r) => r.artisanUserId))];
    const artisans =
      artisanIds.length > 0
        ? await this.usersRepository.find({ where: { id: In(artisanIds) } })
        : [];
    const artisanById = new Map(artisans.map((u) => [u.id, u]));

    const out = new Map<string, MaintenanceAssignmentSummary>();
    for (const [requestId, row] of latestByRequest) {
      const artisan = artisanById.get(row.artisanUserId);
      out.set(requestId, this.toSummary(row, artisan));
    }
    return out;
  }

  private async expireStalePendingForRequests(requestIds: string[]): Promise<void> {
    const pending = await this.assignmentRepository.find({
      where: {
        maintenanceRequestId: In(requestIds),
        status: MaintenanceAssignmentStatus.PENDING,
      },
      select: ['id', 'acceptBy'],
    });
    const staleIds = pending
      .filter((r) => r.acceptBy.getTime() < Date.now())
      .map((r) => r.id);
    if (staleIds.length > 0) {
      await this.expireStalePendingAssignments(staleIds);
    }
  }

  async assignWorker(
    managerUserId: string,
    maintenanceRequestId: string,
    artisanUserId: string,
  ): Promise<MaintenanceAssignmentSummary> {
    const request = await this.maintenanceRepository.findOne({
      where: { id: maintenanceRequestId },
    });
    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    const roster = await this.rosterRepository.findOne({
      where: { managerUserId, artisanUserId },
    });
    if (!roster) {
      throw new BadRequestException(
        'That worker is not on your roster. Add them under Workers first.',
      );
    }

    const artisan = await this.usersRepository.findOne({ where: { id: artisanUserId } });
    if (!artisan || artisan.role !== UserRole.ARTISAN) {
      throw new BadRequestException('Selected user is not a worker / artisan account.');
    }

    await this.expireStalePendingForRequests([maintenanceRequestId]);

    const active = await this.assignmentRepository.findOne({
      where: {
        maintenanceRequestId,
        status: In([
          MaintenanceAssignmentStatus.PENDING,
          MaintenanceAssignmentStatus.ACCEPTED,
        ]),
      },
      order: { assignedAt: 'DESC' },
    });
    if (active?.status === MaintenanceAssignmentStatus.PENDING) {
      throw new ConflictException(
        'This request already has a pending assignment. Wait for the worker to accept or for the 2-hour window to expire.',
      );
    }
    if (active?.status === MaintenanceAssignmentStatus.ACCEPTED) {
      throw new ConflictException(
        'This request is already assigned to a worker who accepted. Cancel or complete it before reassigning.',
      );
    }

    const assignedAt = new Date();
    const row = this.assignmentRepository.create({
      maintenanceRequestId,
      managerUserId,
      artisanUserId,
      status: MaintenanceAssignmentStatus.PENDING,
      assignedAt,
      acceptBy: this.acceptDeadlineFrom(assignedAt),
      respondedAt: null,
    });
    const saved = await this.assignmentRepository.save(row);

    const manager = await this.usersRepository.findOne({ where: { id: managerUserId } });
    try {
      await this.artisanNotificationsService.createMaintenanceAssignmentNotification({
        artisanUserId,
        assignmentId: saved.id,
        maintenanceRequestId,
        requestTitle: request.title,
        managerName: manager?.fullName ?? 'Your property manager',
        acceptBy: saved.acceptBy,
      });
    } catch (err) {
      this.logger.error(
        `Assignment ${saved.id} saved but notification failed for artisan ${artisanUserId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return this.toSummary(saved, artisan);
  }

  async listForArtisan(artisanUserId: string): Promise<ArtisanAssignmentRow[]> {
    await this.expireStalePendingAssignments();

    const rows = await this.assignmentRepository.find({
      where: { artisanUserId },
      order: { assignedAt: 'DESC' },
      take: 100,
    });
    if (rows.length === 0) {
      return [];
    }

    const requestIds = [...new Set(rows.map((r) => r.maintenanceRequestId))];
    const requests = await this.maintenanceRepository.find({
      where: { id: In(requestIds) },
    });
    const requestById = new Map(requests.map((r) => [r.id, r]));

    const managerIds = [...new Set(rows.map((r) => r.managerUserId))];
    const tenantIds = [...new Set(requests.map((r) => r.tenantId))];
    const users = await this.usersRepository.find({
      where: { id: In([...managerIds, ...tenantIds]) },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const profiles = await this.tenantProfileRepository.find({
      where: { userId: In(tenantIds) },
    });
    const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

    return rows
      .filter(
        (r) =>
          r.status === MaintenanceAssignmentStatus.PENDING ||
          r.status === MaintenanceAssignmentStatus.ACCEPTED,
      )
      .map((row) => {
        const req = requestById.get(row.maintenanceRequestId);
        const tenant = req ? userById.get(req.tenantId) : undefined;
        const manager = userById.get(row.managerUserId);
        const tp = req ? profileByUserId.get(req.tenantId) : undefined;
        const propertyAssigned =
          tp?.profileData &&
          typeof tp.profileData === 'object' &&
          !Array.isArray(tp.profileData)
            ? String((tp.profileData as Record<string, unknown>).propertyAssigned ?? '').trim() ||
              null
            : null;
        return {
          id: row.id,
          maintenanceRequestId: row.maintenanceRequestId,
          title: req?.title ?? 'Maintenance request',
          description: req?.description ?? '',
          urgency: req?.urgency ?? 'normal',
          maintenanceStatus: req?.status ?? 'submitted',
          propertyAssigned,
          tenantFullName: tenant?.fullName ?? 'Tenant',
          managerName: manager?.fullName ?? 'Property manager',
          assignmentStatus: row.status,
          assignedAt: row.assignedAt.toISOString(),
          acceptBy: row.acceptBy.toISOString(),
          respondedAt: row.respondedAt?.toISOString() ?? null,
          attachmentUrls: Array.isArray(req?.attachmentUrls) ? req!.attachmentUrls : [],
        };
      })
      .filter(
        (row) =>
          row.assignmentStatus === MaintenanceAssignmentStatus.PENDING ||
          (row.assignmentStatus === MaintenanceAssignmentStatus.ACCEPTED &&
            row.maintenanceStatus !== MaintenanceRequestStatus.RESOLVED),
      );
  }

  /** Push worker dashboards to refresh when a job's maintenance status changes. */
  async notifyArtisanForRequestUpdate(maintenanceRequestId: string): Promise<void> {
    const assignment = await this.assignmentRepository.findOne({
      where: {
        maintenanceRequestId,
        status: In([
          MaintenanceAssignmentStatus.PENDING,
          MaintenanceAssignmentStatus.ACCEPTED,
        ]),
      },
      order: { assignedAt: 'DESC' },
    });
    if (assignment) {
      this.artisanNotificationsRealtime.notifyAssignmentsUpdated(assignment.artisanUserId);
    }
  }

  async acceptAssignment(
    artisanUserId: string,
    assignmentId: string,
  ): Promise<ArtisanAssignmentRow> {
    const row = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
    if (!row) {
      throw new NotFoundException('Assignment not found');
    }
    if (row.artisanUserId !== artisanUserId) {
      throw new ForbiddenException('This assignment is not for your account.');
    }
    if (row.status === MaintenanceAssignmentStatus.EXPIRED) {
      throw new BadRequestException(
        'This assignment expired. Ask your manager to assign the job again.',
      );
    }
    if (row.status !== MaintenanceAssignmentStatus.PENDING) {
      throw new ConflictException(`Assignment is already ${row.status}.`);
    }
    if (row.acceptBy.getTime() < Date.now()) {
      row.status = MaintenanceAssignmentStatus.EXPIRED;
      row.respondedAt = new Date();
      await this.assignmentRepository.save(row);
      throw new BadRequestException(
        'The 2-hour acceptance window has passed. Ask your manager to reassign this job.',
      );
    }

    row.status = MaintenanceAssignmentStatus.ACCEPTED;
    row.respondedAt = new Date();
    await this.assignmentRepository.save(row);

    this.artisanNotificationsRealtime.notifyAssignmentsUpdated(artisanUserId);

    const list = await this.listForArtisan(artisanUserId);
    const found = list.find((a) => a.id === assignmentId);
    if (!found) {
      throw new NotFoundException('Assignment not found after accept');
    }
    return found;
  }

  private toSummary(
    row: MaintenanceAssignment,
    artisan?: User,
  ): MaintenanceAssignmentSummary {
    return {
      id: row.id,
      artisanUserId: row.artisanUserId,
      artisanFullName: artisan?.fullName ?? 'Worker',
      artisanEmail: artisan?.email ?? '',
      status: row.status,
      assignedAt: row.assignedAt.toISOString(),
      acceptBy: row.acceptBy.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
    };
  }
}
