import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FcmPushService } from '../firebase/fcm-push.service';
import { MaintenanceAssignment } from '../maintenance/maintenance-assignment.entity';
import { MaintenanceAssignmentStatus } from '../maintenance/maintenance-assignment-status.enum';
import { MAINTENANCE_ASSIGNMENT_ACCEPT_HOURS } from '../maintenance/maintenance-assignment-status.enum';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { User } from '../users/user.entity';
import { ArtisanNotification } from './artisan-notification.entity';
import { ArtisanNotificationsRealtimeService } from './artisan-notifications-realtime.service';

export type ArtisanNotificationRow = {
  id: string;
  headline: string;
  body: string;
  kind: string;
  isRead: boolean;
  createdAt: string;
  assignmentId: string | null;
  maintenanceRequestId: string | null;
};

@Injectable()
export class ArtisanNotificationsService {
  constructor(
    @InjectRepository(ArtisanNotification)
    private readonly notificationsRepository: Repository<ArtisanNotification>,
    @InjectRepository(MaintenanceAssignment)
    private readonly assignmentRepository: Repository<MaintenanceAssignment>,
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly artisanNotificationsRealtime: ArtisanNotificationsRealtimeService,
    private readonly fcmPush: FcmPushService,
  ) {}

  async listForArtisan(artisanUserId: string): Promise<ArtisanNotificationRow[]> {
    await this.backfillMissingAssignmentNotifications(artisanUserId);
    const rows = await this.notificationsRepository.find({
      where: { artisanUserId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      headline: r.headline,
      body: r.body,
      kind: r.kind,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
      assignmentId: r.assignmentId,
      maintenanceRequestId: r.maintenanceRequestId,
    }));
  }

  async markRead(artisanUserId: string, id: string): Promise<void> {
    const row = await this.notificationsRepository.findOne({ where: { id } });
    if (!row || row.artisanUserId !== artisanUserId) {
      throw new NotFoundException('Notification not found');
    }
    if (!row.isRead) {
      row.isRead = true;
      await this.notificationsRepository.save(row);
    }
  }

  async createMaintenanceAssignmentNotification(params: {
    artisanUserId: string;
    assignmentId: string;
    maintenanceRequestId: string;
    requestTitle: string;
    managerName: string;
    acceptBy: Date;
  }): Promise<{ id: string }> {
    const title = params.requestTitle.trim() || 'Maintenance request';
    const headlineBase = `New job assignment · ${title}`;
    const headline =
      headlineBase.length > 280 ? `${headlineBase.slice(0, 276)}…` : headlineBase;
    const acceptByLabel = params.acceptBy.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const body = [
      `${params.managerName} assigned you a maintenance job.`,
      ``,
      `Request: "${title}"`,
      `Accept within ${MAINTENANCE_ASSIGNMENT_ACCEPT_HOURS} hours (by ${acceptByLabel}).`,
      ``,
      `Open your worker dashboard → Job assignments to accept.`,
    ].join('\n');

    const row = this.notificationsRepository.create({
      artisanUserId: params.artisanUserId,
      kind: 'maintenance_assignment',
      headline,
      body,
      isRead: false,
      assignmentId: params.assignmentId,
      maintenanceRequestId: params.maintenanceRequestId,
    });
    const saved = await this.notificationsRepository.save(row);

    this.artisanNotificationsRealtime.notifyArtisan(params.artisanUserId, {
      id: saved.id,
    });
    this.artisanNotificationsRealtime.notifyAssignmentsUpdated(params.artisanUserId);

    void this.fcmPush.notifyUser(params.artisanUserId, headline, body, {
      kind: 'maintenance_assignment',
      notificationId: saved.id,
      assignmentId: params.assignmentId,
      maintenanceRequestId: params.maintenanceRequestId,
    });

    return { id: saved.id };
  }

  /**
   * Creates in-app alerts for assignments that were saved without a notification
   * (e.g. older deploys or transient DB errors during assign).
   */
  async backfillMissingAssignmentNotifications(artisanUserId: string): Promise<number> {
    const assignments = await this.assignmentRepository.find({
      where: {
        artisanUserId,
        status: In([
          MaintenanceAssignmentStatus.PENDING,
          MaintenanceAssignmentStatus.ACCEPTED,
        ]),
      },
      order: { assignedAt: 'DESC' },
      take: 50,
    });
    if (assignments.length === 0) {
      return 0;
    }

    const assignmentIds = assignments.map((a) => a.id);
    const existing = await this.notificationsRepository.find({
      where: { artisanUserId, assignmentId: In(assignmentIds) },
      select: ['assignmentId'],
    });
    const notified = new Set(
      existing.map((row) => row.assignmentId).filter((id): id is string => Boolean(id)),
    );

    let created = 0;
    for (const assignment of assignments) {
      if (notified.has(assignment.id)) {
        continue;
      }
      const request = await this.maintenanceRepository.findOne({
        where: { id: assignment.maintenanceRequestId },
      });
      const manager = await this.usersRepository.findOne({
        where: { id: assignment.managerUserId },
      });
      await this.createMaintenanceAssignmentNotification({
        artisanUserId,
        assignmentId: assignment.id,
        maintenanceRequestId: assignment.maintenanceRequestId,
        requestTitle: request?.title ?? 'Maintenance request',
        managerName: manager?.fullName ?? 'Your property manager',
        acceptBy: assignment.acceptBy,
      });
      created += 1;
    }
    return created;
  }
}
