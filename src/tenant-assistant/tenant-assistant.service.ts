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
          'Ask something in your own words—for example about maintenance, **Alerts** / notifications, **Upcoming rent** and renewals, your **unit or building**, payments, or lease documents—and I’ll point you to the right spot on your dashboard or summarize what we have on file.',
      };
    }

    const lower = message.toLowerCase();

    if (this.isGreeting(lower)) {
      return {
        reply: `Hi ${firstName}. I’m your EstateFlow tenant assistant. I can help with maintenance requests, **Alerts** (in-app messages, including rent renewals), **Upcoming rent**, your **unit and building** as we have them on file, payments and balance, and where to find lease documents. What would you like to know?`,
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
      reply: `Hi ${firstName} — I’m not sure I caught that yet.

${this.buildHelpReply(firstName)}`,
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
      'Your property manager sets your unit and building when they add or update your profile—that’s the same line you see under your name on the dashboard.';

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
    return `Here’s what I can help with, ${firstName}:

• **Maintenance** — recap your repair tickets or explain how to submit a new one (**Maintenance** → **Submit issue**). When your manager updates a request, you’ll usually see that in **Alerts** too.

• **Rent & payments** — **Upcoming rent**, your balance, **Payment history**, and **Alerts** (where formal renewal letters often land).

• **Unit & building** — what we show under your name on the dashboard, based on how your manager onboarded you.

• **Live updates** — new notices show up in **Alerts** automatically, so your unread count stays current while you use the portal.

• **Lease documents** — signed PDFs and add-ons at the bottom of your dashboard.

• **Account** — confirm the name and email on your login.

Ask however you like—for example: “Any unread messages?” “What’s my renewal rent?” or “What unit am I in?”`;
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
        dataLine = `\n\nYour **Upcoming rent** card is also carrying: ${bits.join(' · ')}—that comes from the latest renewal notice your manager sent through.`;
      }
    } else if (upcoming.source === 'profile' && upcoming.monthlyRentDisplay) {
      dataLine = `\n\n**Upcoming rent** is using the monthly rent on your profile (**${upcoming.monthlyRentDisplay}**) for now. If your manager sends a renewal with full details, we’ll layer those in on the card as well.`;
    }

    const counts = `You have **${notifications.length}** notification${notifications.length === 1 ? '' : 's'} on file, **${unread}** still unread (${renewalUnread} renewal-related, ${maintenanceUnread} maintenance update${maintenanceUnread === 1 ? '' : 's'}).`;

    return `Hi ${firstName}.

Open **Alerts** on your tenant dashboard for messages from your property team—rent renewal letters, maintenance status changes when your manager moves a ticket along, and similar. Open a row to read the whole thing; once you’ve read it in the app, we mark it read so your badge stays accurate.

${counts}${dataLine}

New items appear here as your manager sends them, and the list keeps itself in sync while you’re using the portal.`;
  }

  private buildRentReply(
    firstName: string,
    upcoming: UpcomingRentSummary,
    notifications: TenantNotificationRow[],
  ): string {
    const unread = notifications.filter((n) => !n.isRead).length;

    let renewalText = '';
    if (upcoming.source === 'renewal_notice') {
      const rent = upcoming.monthlyRentDisplay;
      const when = upcoming.effectiveDate
        ? formatIsoDateForAssistant(upcoming.effectiveDate)
        : null;
      if (rent && when) {
        renewalText = `From the latest renewal notice we have on file: your manager is proposing **${rent}** per month, with a renewal anchor date of **${when}**.`;
      } else if (rent) {
        renewalText = `From the latest renewal notice we have on file: your manager is proposing **${rent}** per month.`;
      } else if (when) {
        renewalText = `From the latest renewal notice we have on file: the renewal anchor date is **${when}**.`;
      }
    } else if (upcoming.source === 'profile' && upcoming.monthlyRentDisplay) {
      renewalText = `**Upcoming rent** is currently showing **${upcoming.monthlyRentDisplay}** from your tenant profile. If your manager sends a renewal with dates and figures spelled out, we’ll show those details on that card too.`;
    } else {
      renewalText =
        '**Upcoming rent** will fill in with renewal amounts and dates once your property manager sends a notice with those details—or with the rent on your profile until then.';
    }

    const notifText =
      unread > 0
        ? `You’ve got **${unread}** unread message${unread === 1 ? '' : 's'} in **Alerts**—worth a quick look for things like rent renewals.`
        : '';

    const out: string[] = [
      `Hi ${firstName}.`,
      '',
      'Think of your dashboard in four buckets:',
      '',
      '• **Upcoming rent** — renewal summaries when your manager has shared them.',
      '• **Current balance** — what you owe right now.',
      '• **Payment history** — what’s already been paid.',
      '• **Alerts** — letters and updates from your property manager.',
    ];
    if (renewalText) {
      out.push('', renewalText);
    }
    if (notifText) {
      out.push('', notifText);
    }
    out.push(
      '',
      'Those areas stay up to date on their own as we receive new information—start there whenever you’re checking on rent or money matters.',
    );
    return out.join('\n');
  }

  private buildLeaseReply(firstName: string, lower: string): string {
    const renewal =
      /\b(renewal|renew|rent increase|new rent)\b/i.test(lower) &&
      !this.isNotificationsTopic(lower);
    const extra = renewal
      ? '\n\nIf you’re looking for the formal renewal letter itself, your manager may have placed it in **Alerts** as well.'
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
      return `Hi ${firstName}. To log a new problem, open **Maintenance**, choose **Submit issue**, then describe what’s wrong and pick how urgent it is. You can follow everything under **Track requests** on the same page. Your unit and building at the top of the dashboard help your team know where to respond.`;
    }

    if (rows.length === 0) {
      return `Hi ${firstName}. You don’t have any maintenance requests on file yet. When something needs attention, go to **Maintenance** → **Submit issue** so your property team can help.`;
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

    return `Hi ${firstName}. You’ve got **${rows.length}** maintenance request${rows.length === 1 ? '' : 's'} on file; **${active.length}** ${active.length === 1 ? 'is' : 'are'} still open or in progress.

${lines}${more}

Use the **Maintenance** page for full details, photos, and updates. When your manager changes a ticket’s status, you’ll usually see a note in **Alerts** too—and your unit or building stays visible at the top of the dashboard for context.`;
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
