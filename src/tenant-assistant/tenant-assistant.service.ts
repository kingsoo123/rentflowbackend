import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import type { SubmittedMaintenanceResponse } from '../maintenance/tenant-maintenance-requests.service';
import { TenantMaintenanceRequestsService } from '../maintenance/tenant-maintenance-requests.service';
import type {
  TenantNotificationRow,
  UpcomingRentSummary,
} from '../tenant-notifications/tenant-notifications.service';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';

@Injectable()
export class TenantAssistantService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tenantMaintenanceRequestsService: TenantMaintenanceRequestsService,
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  async reply(tenantId: string, rawMessage: string): Promise<{ reply: string }> {
    const message = rawMessage.trim();
    const user = await this.usersRepository.findOne({ where: { id: tenantId } });
    const firstName = firstToken(user?.fullName) ?? 'there';
    const fullName = user?.fullName?.trim() || 'Tenant';
    const email = user?.email?.trim() || 'the email on your account';

    if (!message) {
      return {
        reply:
          'Send a short question—for example about maintenance, **Alerts** / notifications, **Upcoming rent** (renewals), your **unit or property** (GET /api/tenants/profile), payments, or lease documents—and I will point you to the right place or summarize what we have on file.',
      };
    }

    const lower = message.toLowerCase();

    if (this.isGreeting(lower)) {
      return {
        reply: `Hi ${firstName}. I am your EstateFlow tenant assistant. I can summarize maintenance requests, explain **Alerts** (in-app notifications, including rent renewals), **Upcoming rent** on your dashboard, your **unit and building** (from GET /api/tenants/profile), payment history and balance, and where lease documents live. What would you like to know?`,
      };
    }

    if (this.isResidenceTopic(lower)) {
      const profile =
        await this.tenantNotificationsService.getTenantProfileSummary(tenantId);
      return { reply: this.buildResidenceReply(firstName, profile) };
    }

    const needNotificationsContext =
      this.isNotificationsTopic(lower) || this.isRentOrPaymentTopic(lower);

    let upcoming: UpcomingRentSummary = {
      monthlyRentDisplay: null,
      effectiveDate: null,
      source: 'none',
    };
    let notifications: TenantNotificationRow[] = [];
    if (needNotificationsContext) {
      [upcoming, notifications] = await Promise.all([
        this.tenantNotificationsService.getUpcomingRentSummary(tenantId),
        this.tenantNotificationsService.listForTenant(tenantId),
      ]);
    }

    if (this.isNotificationsTopic(lower)) {
      return {
        reply: this.buildNotificationsReply(firstName, notifications, upcoming),
      };
    }

    const maintenanceRows =
      await this.tenantMaintenanceRequestsService.listForTenant(tenantId);

    if (this.isMaintenanceTopic(lower)) {
      return {
        reply: this.buildMaintenanceReply(
          firstName,
          maintenanceRows,
          message,
        ),
      };
    }

    if (this.isRentOrPaymentTopic(lower)) {
      return {
        reply: this.buildRentReply(firstName, upcoming, notifications),
      };
    }

    if (this.isLeaseTopic(lower)) {
      return {
        reply: this.buildLeaseReply(firstName, lower),
      };
    }

    if (this.isAccountQuestion(lower)) {
      return {
        reply: `You are signed in as ${fullName} (${email}). For password or email changes, use your building office or the sign-in help flow your manager provides.`,
      };
    }

    if (this.wantsHelpOverview(lower)) {
      return { reply: this.buildHelpReply(firstName) };
    }

    return {
      reply: `Hi ${firstName}. I did not match that to a specific topic yet.\n\n${this.buildHelpReply(firstName)}`,
    };
  }

  private isGreeting(lower: string): boolean {
    return /^(hi|hello|hey)\b/i.test(lower.trim());
  }

  private wantsHelpOverview(lower: string): boolean {
    return /\b(help|what can you|what do you do|capabilities|options)\b/i.test(
      lower,
    );
  }

  private isAccountQuestion(lower: string): boolean {
    return (
      /\b(my name|who am i|my email|signed in as|my account)\b/i.test(lower) ||
      (/\b(email|profile)\b/i.test(lower) && /\b(my|me)\b/i.test(lower))
    );
  }

  private isMaintenanceTopic(lower: string): boolean {
    return /\b(maintenance|repair|fix|leak|hvac|plumb|issue|work order|ticket|request)\b/i.test(
      lower,
    );
  }

  /** Alerts, inbox, renewal letters, unread badge, etc. */
  private isNotificationsTopic(lower: string): boolean {
    return /\b(notification|notifications|alert|alerts|inbox|unread|badge|rent renewal notice|renewal notice)\b/i.test(
      lower,
    );
  }

  private isRentOrPaymentTopic(lower: string): boolean {
    return /\b(rent|pay|payment|balance|due|owe|charge|statement|receipt|upcoming rent|renewal rent)\b/i.test(
      lower,
    );
  }

  private isLeaseTopic(lower: string): boolean {
    return /\b(lease|document|pdf|paperwork|contract|addendum)\b/i.test(lower);
  }

  /** Unit, building, or dashboard residence line (from tenant_profiles via manager onboarding). */
  private isResidenceTopic(lower: string): boolean {
    return (
      /\b(unit|suite|loft|floor|which building|what building|which apartment|what apartment|assigned property|property name|where i live|my building|my address|residence|dashboard header)\b/i.test(
        lower,
      ) ||
      /\bmy unit\b/i.test(lower) ||
      /\b(apartment|apt\.?)\s*(#|no\.?|number)?\s*[\w-]+\b/i.test(lower)
    );
  }

  private buildResidenceReply(
    firstName: string,
    profile: { unitNumber: string | null; propertyAssigned: string | null },
  ): string {
    const unit = profile.unitNumber?.trim() || null;
    const prop = profile.propertyAssigned?.trim() || null;
    const managerNote =
      'Your property manager sets **unitNumber** and **propertyAssigned** when they add or onboard a tenant (**POST /api/managers/tenants**). The tenant portal reads them with **GET /api/tenants/profile** (same values as the line under your name on the dashboard).';

    if (!unit && !prop) {
      return `Hi ${firstName}. We do not have a unit or property label on your profile yet.\n\n${managerNote}`;
    }

    const unitLine =
      unit && /^unit\s+/i.test(unit)
        ? unit
        : unit
          ? `Unit ${unit}`
          : null;
    const headline =
      unitLine && prop
        ? `${unitLine} · ${prop}`
        : unitLine || prop || '—';

    return `Hi ${firstName}. On file for your residence line: **${headline}**.\n\n${managerNote}`;
  }

  private buildHelpReply(firstName: string): string {
    return `Here is what I can help with, ${firstName}:\n\n• **Maintenance** — summarize your requests or explain how to submit a new issue (Maintenance → Submit issue). Data: GET /api/tenants/maintenance-requests; create: POST /api/tenants/maintenance-requests. Status changes from your manager also appear under **Alerts** (GET /api/tenants/notifications).\n• **Rent & payments** — **Upcoming rent** (GET /api/tenants/upcoming-rent), balance, Payment history, and **Alerts** for renewal letters (GET /api/tenants/notifications; mark read: PATCH /api/tenants/notifications/:id/read).\n• **Unit & building** — dashboard header (GET /api/tenants/profile returns unitNumber and propertyAssigned from manager onboarding).\n• **Live updates** — new notices refresh the Alerts indicator over Socket.IO /tenants/notifications (event notifications:updated).\n• **Lease documents** — downloads at the bottom of your dashboard.\n• **Assistant** — this chat: POST /api/tenants/assistant/chat (tenant JWT, body { message }).\n• **Account** — confirm the name and email on your login.\n\nAsk in your own words, for example: "Any unread notifications?" or "What is my renewal rent?" or "What unit am I in?"`;
  }

  private buildNotificationsReply(
    firstName: string,
    notifications: TenantNotificationRow[],
    upcoming: UpcomingRentSummary,
  ): string {
    const unread = notifications.filter((n) => !n.isRead).length;
    const renewalUnread = notifications.filter(
      (n) => !n.isRead && n.kind === 'rent_renewal',
    ).length;
    const maintenanceUnread = notifications.filter(
      (n) => !n.isRead && n.kind === 'maintenance_status',
    ).length;

    let dataLine = '';
    if (upcoming.source === 'renewal_notice') {
      const bits: string[] = [];
      if (upcoming.monthlyRentDisplay) {
        bits.push(`proposed renewal rent **${upcoming.monthlyRentDisplay}**`);
      }
      if (upcoming.effectiveDate) {
        bits.push(`lease-end / anchor date **${upcoming.effectiveDate}**`);
      }
      if (bits.length) {
        dataLine = `\n\nOn your **Upcoming rent** card we also show: ${bits.join(' · ')} (from your latest delivered renewal notice).`;
      }
    } else if (upcoming.source === 'profile' && upcoming.monthlyRentDisplay) {
      dataLine = `\n\n**Upcoming rent** is currently using monthly rent on your profile (**${upcoming.monthlyRentDisplay}**) until a renewal notice with structured fields is delivered.`;
    }

    const counts = `You have **${notifications.length}** notification(s) on file; **${unread}** unread (${renewalUnread} rent renewal · ${maintenanceUnread} maintenance status).`;

    return `Hi ${firstName}. Open **Alerts** on your tenant dashboard to read in-app messages (rent renewal letters, maintenance status updates when your manager moves a request along, and similar). Expand a row to read the full message—doing so marks it read in the app.\n\n${counts}${dataLine}\n\n**APIs** the EstateFlow tenant app uses: GET /api/tenants/notifications (list), PATCH /api/tenants/notifications/:id/read (mark read), GET /api/tenants/upcoming-rent (Upcoming rent card), GET /api/tenants/profile (unit/building for the header). New items also trigger Socket.IO **notifications:updated** on namespace /tenants/notifications.`;
  }

  private buildRentReply(
    firstName: string,
    upcoming: UpcomingRentSummary,
    notifications: TenantNotificationRow[],
  ): string {
    const unread = notifications.filter((n) => !n.isRead).length;

    let renewalBlock = '';
    if (upcoming.source === 'renewal_notice') {
      const lines: string[] = [];
      if (upcoming.monthlyRentDisplay) {
        lines.push(
          `Proposed renewal monthly rent: **${upcoming.monthlyRentDisplay}**`,
        );
      }
      if (upcoming.effectiveDate) {
        lines.push(
          `Lease-end / renewal anchor date: **${formatIsoDateForAssistant(upcoming.effectiveDate)}**`,
        );
      }
      renewalBlock =
        lines.length > 0
          ? `\n\nFrom your latest renewal notice on file:\n${lines.join('\n')}`
          : '';
    } else if (upcoming.source === 'profile' && upcoming.monthlyRentDisplay) {
      renewalBlock = `\n\n**Upcoming rent** is showing monthly rent from your tenant profile (**${upcoming.monthlyRentDisplay}**). When your manager sends a renewal notice with structured fields, that card can also show renewal-specific dates.`;
    } else {
      renewalBlock =
        '\n\n**Upcoming rent** will show renewal amounts and key dates after your property manager delivers a renewal notice with those fields, or rent on your profile otherwise.';
    }

    const notifHint =
      unread > 0
        ? `\n\nYou have **${unread}** unread notification(s)—check **Alerts** for letters such as rent renewals.`
        : '';

    return `Hi ${firstName}. On your **Dashboard**: use **Upcoming rent** for renewal summary data, **Current balance** and **Payment history** for what you owe and what was paid, and **Alerts** for messages from your property manager.${renewalBlock}${notifHint}\n\n**REST:** GET /api/tenants/upcoming-rent, GET /api/tenants/notifications, PATCH /api/tenants/notifications/:id/read, GET /api/tenants/profile (unit + property labels). **WebSocket:** /tenants/notifications → event **notifications:updated** when something new arrives. **Maintenance:** GET /api/tenants/maintenance-requests, POST /api/tenants/maintenance-requests.`;
  }

  private buildLeaseReply(firstName: string, lower: string): string {
    const renewal =
      /\b(renewal|renew|rent increase|new rent)\b/i.test(lower) &&
      !this.isNotificationsTopic(lower);
    const extra = renewal
      ? '\n\nFor formal renewal letters, also check **Alerts** (GET /api/tenants/notifications)—your manager may deliver the full notice there.'
      : '';
    return `Hi ${firstName}. Signed lease PDFs and related paperwork are under **Lease documents** at the bottom of your dashboard—each row has a download action.${extra}`;
  }

  private buildMaintenanceReply(
    firstName: string,
    rows: SubmittedMaintenanceResponse[],
    original: string,
  ): string {
    const wantsHowToSubmit =
      /\b(submit|report|file|create|new|open|start|log)\b/i.test(original) &&
      /\b(request|issue|ticket|maintenance)\b/i.test(original);

    if (wantsHowToSubmit) {
      return `Hi ${firstName}. To report a new problem, open **Maintenance** in the tenant portal, choose **Submit issue**, then describe what is wrong and pick urgency. You can track everything under **Track requests** on the same page. The app loads your tickets from GET /api/tenants/maintenance-requests and creates new ones with POST /api/tenants/maintenance-requests. Your unit/building label on the dashboard comes from GET /api/tenants/profile.`;
    }

    if (rows.length === 0) {
      return `Hi ${firstName}. You do not have any maintenance requests on file yet. When something needs attention, use Maintenance → Submit issue so your property team can respond. (POST /api/tenants/maintenance-requests creates a request.)`;
    }

    const active = rows.filter((r) => r.status !== 'resolved');
    const lines = rows
      .slice(0, 10)
      .map((r) => {
        const when = formatShortDate(r.createdAt);
        return `• ${r.title} — ${formatStatusForAssistant(r.status)} (submitted ${when})`;
      })
      .join('\n');

    const more =
      rows.length > 10 ? `\n…plus ${rows.length - 10} more in the full list.` : '';

    return `Hi ${firstName}. You have ${rows.length} maintenance request(s) on file; ${active.length} are still open or in progress.\n\n${lines}${more}\n\nOpen the **Maintenance** page for full details, attachments, and updates (same data as GET /api/tenants/maintenance-requests). When your manager changes a request’s status, you also get an **Alerts** notification (GET /api/tenants/notifications). Related: GET /api/tenants/profile for unit/property shown on the dashboard header.`;
  }
}

function formatIsoDateForAssistant(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function firstToken(fullName?: string | null): string | undefined {
  const t = fullName?.trim();
  if (!t) {
    return undefined;
  }
  return t.split(/\s+/)[0];
}

function formatShortDate(d: Date): string {
  try {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function formatStatusForAssistant(status: string): string {
  const s = status.toLowerCase();
  if (s === 'resolved') {
    return 'Completed';
  }
  if (s === 'in_progress' || s === 'reviewing') {
    return 'In progress';
  }
  return 'New';
}
