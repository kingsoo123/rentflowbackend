import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { TenantProfile } from '../users/tenant-profile.entity';
import { TenantNotification } from './tenant-notification.entity';
import { PropertyBroadcast } from './property-broadcast.entity';
import { RentRenewalMailService } from '../email/rent-renewal-mail.service';
import { FcmPushService } from '../firebase/fcm-push.service';
import { TenantNotificationsRealtimeService } from './tenant-notifications-realtime.service';

export type TenantNotificationRow = {
  id: string;
  headline: string;
  body: string;
  kind: string;
  isRead: boolean;
  createdAt: Date;
};

export type UpcomingRentSummary = {
  monthlyRentDisplay: string | null;
  effectiveDate: string | null;
  source: 'renewal_notice' | 'profile' | 'none';
};

export type RentRenewalDelivered = {
  email: string;
  tenantId: string;
  notificationId: string;
  emailSent: boolean;
  emailSkipped: boolean;
};

export type RentRenewalFailed = {
  email: string;
  reason: string;
};

export type PropertyBroadcastSummary = {
  id: string;
  headline: string;
  body: string;
  tenantCount: number;
  createdAt: Date;
};

const MAX_PROPERTY_BROADCAST_TENANTS = 500;

function maintenanceStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'submitted') {
    return 'Submitted';
  }
  if (s === 'reviewing') {
    return 'Under review';
  }
  if (s === 'in_progress') {
    return 'In progress';
  }
  if (s === 'resolved') {
    return 'Completed';
  }
  return status;
}

function strFromProfile(
  profile: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const v = profile[key];
  if (v === undefined || v === null) {
    return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

@Injectable()
export class TenantNotificationsService {
  private readonly logger = new Logger(TenantNotificationsService.name);

  constructor(
    @InjectRepository(TenantNotification)
    private readonly notificationsRepository: Repository<TenantNotification>,
    @InjectRepository(PropertyBroadcast)
    private readonly propertyBroadcastRepository: Repository<PropertyBroadcast>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    private readonly tenantNotificationsRealtime: TenantNotificationsRealtimeService,
    private readonly rentRenewalMailService: RentRenewalMailService,
    private readonly fcmPush: FcmPushService,
  ) {}

  /**
   * Deliver the same renewal notice to multiple tenant accounts (by login email).
   * Per-email failures (unknown / non-tenant) are collected in `failed`; others still deliver.
   */
  async sendRentRenewalNotices(params: {
    tenantEmails: string[];
    noticeBody: string;
    headline?: string;
    renewalMonthlyRentDisplay?: string;
    renewalEffectiveDate?: string;
  }): Promise<{
    delivered: RentRenewalDelivered[];
    failed: RentRenewalFailed[];
  }> {
    const delivered: RentRenewalDelivered[] = [];
    const failed: RentRenewalFailed[] = [];

    for (const email of params.tenantEmails) {
      try {
        const r = await this.sendRentRenewalNoticeForEmail({
          tenantEmail: email,
          noticeBody: params.noticeBody,
          headline: params.headline,
          renewalMonthlyRentDisplay: params.renewalMonthlyRentDisplay,
          renewalEffectiveDate: params.renewalEffectiveDate,
        });
        delivered.push({
          email,
          tenantId: r.tenantId,
          notificationId: r.id,
          emailSent: r.emailSent,
          emailSkipped: r.emailSkipped,
        });
      } catch (e) {
        if (e instanceof NotFoundException) {
          failed.push({ email, reason: e.message });
        } else {
          throw e;
        }
      }
    }

    return { delivered, failed };
  }

  private async sendRentRenewalNoticeForEmail(params: {
    tenantEmail: string;
    noticeBody: string;
    headline?: string;
    renewalMonthlyRentDisplay?: string;
    renewalEffectiveDate?: string;
  }): Promise<{
    id: string;
    tenantId: string;
    emailSent: boolean;
    emailSkipped: boolean;
  }> {
    const email = params.tenantEmail.trim().toLowerCase();
    const tenant = await this.usersRepository.findOne({
      where: { email },
    });
    if (!tenant) {
      throw new NotFoundException(
        'No account found with that email. The tenant must sign up first.',
      );
    }
    if (tenant.role !== UserRole.TENANT) {
      throw new NotFoundException(
        'That email is not registered as a tenant account.',
      );
    }

    const headline =
      params.headline?.trim() ||
      'Rent renewal notice from your property manager';

    const rentDisplay =
      params.renewalMonthlyRentDisplay?.trim() || null;
    const effectiveDate = params.renewalEffectiveDate?.trim() || null;

    const row = this.notificationsRepository.create({
      tenantId: tenant.id,
      kind: 'rent_renewal',
      headline,
      body: params.noticeBody,
      isRead: false,
      renewalMonthlyRentDisplay: rentDisplay,
      renewalEffectiveDate: effectiveDate,
    });
    const saved = await this.notificationsRepository.save(row);
    this.tenantNotificationsRealtime.notifyTenant(tenant.id, { id: saved.id });
    await this.fcmPush.notifyTenant(tenant.id, headline, params.noticeBody, {
      kind: 'rent_renewal',
      notificationId: saved.id,
    });
    this.logger.log(
      `Rent renewal in-app + push dispatched for tenantId=${tenant.id} notificationId=${saved.id}`,
    );

    const mail = await this.rentRenewalMailService.sendRentRenewalNoticeEmail({
      to: tenant.email,
      subject: headline,
      noticeBody: params.noticeBody,
    });

    return {
      id: saved.id,
      tenantId: tenant.id,
      emailSent: mail.ok,
      emailSkipped: Boolean(mail.skipped),
    };
  }

  /**
   * In-app alert when a property manager changes maintenance status
   * (`PATCH /api/managers/maintenance-requests/:id`).
   */
  async createMaintenanceStatusNotification(params: {
    tenantId: string;
    title: string;
    previousStatus: string;
    newStatus: string;
  }): Promise<{ id: string } | null> {
    if (params.previousStatus === params.newStatus) {
      return null;
    }

    const title = params.title.trim() || 'Maintenance request';
    const headlineBase = `Maintenance · ${title}`;
    const headline =
      headlineBase.length > 280 ? `${headlineBase.slice(0, 276)}…` : headlineBase;

    const prevLabel = maintenanceStatusLabel(params.previousStatus);
    const nextLabel = maintenanceStatusLabel(params.newStatus);
    const body = [
      `Your property team updated a maintenance request you submitted.`,
      ``,
      `Request: "${title}"`,
      `Status: ${prevLabel} → ${nextLabel}`,
      ``,
      `Open Maintenance on your tenant dashboard for full details.`,
    ].join('\n');

    const row = this.notificationsRepository.create({
      tenantId: params.tenantId,
      kind: 'maintenance_status',
      headline,
      body,
      isRead: false,
      renewalMonthlyRentDisplay: null,
      renewalEffectiveDate: null,
    });
    const saved = await this.notificationsRepository.save(row);
    this.tenantNotificationsRealtime.notifyTenant(params.tenantId, {
      id: saved.id,
    });
    void this.fcmPush.notifyTenant(params.tenantId, headline, body, {
      kind: 'maintenance_status',
      notificationId: saved.id,
    });
    return { id: saved.id };
  }

  /**
   * One portfolio-wide notice: stored once per tenant (Alerts) and once on the
   * manager’s broadcast list for audit/history.
   */
  async broadcastPropertyNoticeToAllTenants(params: {
    managerId: string;
    headline: string;
    body: string;
  }): Promise<{
    broadcastId: string;
    tenantCount: number;
    createdAt: Date;
  }> {
    const tenants = await this.usersRepository.find({
      where: { role: UserRole.TENANT },
      select: ['id'],
      order: { id: 'ASC' },
    });
    if (tenants.length === 0) {
      throw new BadRequestException(
        'No tenant accounts exist yet. Add tenants before sending a portfolio notice.',
      );
    }
    if (tenants.length > MAX_PROPERTY_BROADCAST_TENANTS) {
      throw new BadRequestException(
        `Too many tenant accounts (${tenants.length}) for one notice; max is ${MAX_PROPERTY_BROADCAST_TENANTS}.`,
      );
    }
    const headline = params.headline.trim().slice(0, 280);
    const body = params.body.trim();

    const { broadcastId, createdAt } =
      await this.notificationsRepository.manager.transaction(async (em) => {
        const broadcastRepo = em.getRepository(PropertyBroadcast);
        const notifRepo = em.getRepository(TenantNotification);

        const broadcast = broadcastRepo.create({
          managerId: params.managerId,
          headline,
          body,
          tenantCount: tenants.length,
        });
        const savedBroadcast = await broadcastRepo.save(broadcast);

        for (const t of tenants) {
          const row = notifRepo.create({
            tenantId: t.id,
            kind: 'property_broadcast',
            headline,
            body,
            isRead: false,
            renewalMonthlyRentDisplay: null,
            renewalEffectiveDate: null,
            broadcastId: savedBroadcast.id,
          });
          await notifRepo.save(row);
        }

        return {
          broadcastId: savedBroadcast.id,
          createdAt: savedBroadcast.createdAt,
        };
      });

    for (const t of tenants) {
      this.tenantNotificationsRealtime.notifyTenant(t.id, {});
    }

    void this.fcmPush.notifyTenantsMulticast(
      tenants.map((t) => t.id),
      headline,
      body,
      {
        kind: 'property_broadcast',
        broadcastId,
      },
    );

    return {
      broadcastId,
      tenantCount: tenants.length,
      createdAt,
    };
  }

  /**
   * Manager-created task: in-app row + socket + push (Expo + native FCM) per tenant.
   */
  async createManagerTaskNotificationsForTenants(params: {
    tenantIds: string[];
    headline: string;
    body: string;
  }): Promise<{ notified: number }> {
    const unique = [...new Set(params.tenantIds)];
    let notified = 0;
    for (const tenantId of unique) {
      const row = this.notificationsRepository.create({
        tenantId,
        kind: 'manager_task',
        headline: params.headline.slice(0, 280),
        body: params.body.slice(0, 4000),
        isRead: false,
        renewalMonthlyRentDisplay: null,
        renewalEffectiveDate: null,
      });
      const saved = await this.notificationsRepository.save(row);
      this.tenantNotificationsRealtime.notifyTenant(tenantId, { id: saved.id });
      void this.fcmPush.notifyTenant(tenantId, params.headline, params.body, {
        kind: 'manager_task',
        notificationId: saved.id,
      });
      notified += 1;
    }
    return { notified };
  }

  /**
   * After a manager saves service charge lines for a property: in-app row + socket
   * (`notifications:updated`) + push per affected tenant.
   */
  async createServiceChargeNotificationsForTenants(params: {
    tenantIds: string[];
    propertyName: string;
  }): Promise<{ notified: number }> {
    const unique = [...new Set(params.tenantIds)];
    const name = params.propertyName.trim() || 'your building';
    const headline = 'Service charges updated';
    const body =
      `Your property manager updated fees for ${name}. Open Service charges on your dashboard to review the line items.`.slice(
        0,
        4000,
      );
    let notified = 0;
    for (const tenantId of unique) {
      const row = this.notificationsRepository.create({
        tenantId,
        kind: 'service_charges',
        headline: headline.slice(0, 280),
        body,
        isRead: false,
        renewalMonthlyRentDisplay: null,
        renewalEffectiveDate: null,
      });
      const saved = await this.notificationsRepository.save(row);
      this.tenantNotificationsRealtime.notifyTenant(tenantId, { id: saved.id });
      await this.fcmPush.notifyTenant(tenantId, headline, body, {
        kind: 'service_charges',
        notificationId: saved.id,
      });
      notified += 1;
    }
    return { notified };
  }

  async listPropertyBroadcastsForManager(
    managerId: string,
  ): Promise<PropertyBroadcastSummary[]> {
    const rows = await this.propertyBroadcastRepository.find({
      where: { managerId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      headline: r.headline,
      body: r.body,
      tenantCount: r.tenantCount,
      createdAt: r.createdAt,
    }));
  }

  async listForTenant(tenantId: string): Promise<TenantNotificationRow[]> {
    const rows = await this.notificationsRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      headline: r.headline,
      body: r.body,
      kind: r.kind,
      isRead: r.isRead,
      createdAt: r.createdAt,
    }));
  }

  async markRead(tenantId: string, id: string): Promise<void> {
    const res = await this.notificationsRepository.update(
      { id, tenantId },
      { isRead: true },
    );
    if (res.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /** Unit + property from manager onboarding (`POST /api/managers/tenants` → `profile`), plus `fullName` from `users`. */
  async getTenantProfileSummary(
    tenantId: string,
  ): Promise<{
    unitNumber: string | null;
    propertyAssigned: string | null;
    fullName: string | null;
  }> {
    const [tp, user] = await Promise.all([
      this.tenantProfileRepository.findOne({
        where: { userId: tenantId },
      }),
      this.usersRepository.findOne({
        where: { id: tenantId },
        select: ['id', 'fullName'],
      }),
    ]);
    const profile =
      tp?.profileData &&
      typeof tp.profileData === 'object' &&
      !Array.isArray(tp.profileData)
        ? (tp.profileData as Record<string, unknown>)
        : undefined;
    const full = user?.fullName?.trim();
    return {
      unitNumber: strFromProfile(profile, 'unitNumber'),
      propertyAssigned: strFromProfile(profile, 'propertyAssigned'),
      fullName: full && full.length > 0 ? full : null,
    };
  }

  async getUpcomingRentSummary(tenantId: string): Promise<UpcomingRentSummary> {
    const latestRenewal = await this.notificationsRepository.findOne({
      where: { tenantId, kind: 'rent_renewal' },
      order: { createdAt: 'DESC' },
    });

    const hasRenewalSummary =
      latestRenewal &&
      (Boolean(latestRenewal.renewalMonthlyRentDisplay?.trim()) ||
        latestRenewal.renewalEffectiveDate != null);

    if (latestRenewal && hasRenewalSummary) {
      return {
        monthlyRentDisplay:
          latestRenewal.renewalMonthlyRentDisplay?.trim() || null,
        effectiveDate: this.normalizePgDate(
          latestRenewal.renewalEffectiveDate,
        ),
        source: 'renewal_notice',
      };
    }

    const tp = await this.tenantProfileRepository.findOne({
      where: { userId: tenantId },
    });
    const profile =
      tp?.profileData &&
      typeof tp.profileData === 'object' &&
      !Array.isArray(tp.profileData)
        ? (tp.profileData as Record<string, unknown>)
        : undefined;
    const rentAmount = strFromProfile(profile, 'rentAmount');
    if (rentAmount) {
      return {
        monthlyRentDisplay: rentAmount,
        effectiveDate: null,
        source: 'profile',
      };
    }

    return {
      monthlyRentDisplay: null,
      effectiveDate: null,
      source: 'none',
    };
  }

  private normalizePgDate(value: unknown): string | null {
    if (value == null) {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return null;
  }
}
