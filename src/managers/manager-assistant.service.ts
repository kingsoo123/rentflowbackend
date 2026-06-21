import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentConfirmationStatus } from '../payment-confirmations/payment-confirmation-status.enum';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { User } from '../users/user.entity';
import type { ManagerMaintenanceRequestRow } from './managers-maintenance-requests.service';
import { ManagersMaintenanceRequestsService } from './managers-maintenance-requests.service';
import { ManagersPortfolioService } from './managers-portfolio.service';
import { ManagersTenantsService } from './managers-tenants.service';

@Injectable()
export class ManagerAssistantService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantPaymentConfirmation)
    private readonly paymentConfirmationsRepository: Repository<TenantPaymentConfirmation>,
    private readonly managersPortfolioService: ManagersPortfolioService,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly managersMaintenanceRequestsService: ManagersMaintenanceRequestsService,
  ) {}

  async reply(managerUserId: string, rawMessage: string): Promise<{ reply: string }> {
    const message = rawMessage.trim();
    const user = await this.usersRepository.findOne({ where: { id: managerUserId } });
    const firstName = firstToken(user?.fullName) ?? 'there';
    const fullName = user?.fullName?.trim() || 'Property manager';
    const email = user?.email?.trim() || 'the email on your account';

    if (!message) {
      return {
        reply:
          'Ask something in your own words—for example about **payments**, **maintenance**, **tenants**, **renewals**, **service charges**, **properties**, or **notifications**—and I’ll point you to the right part of your dashboard.',
      };
    }

    const lower = message.toLowerCase();

    if (this.isGreeting(lower)) {
      return {
        reply: `Hi ${firstName}. I’m your EstateFlow manager assistant. I can help with confirming tenant payments, triaging maintenance, sending renewals and broadcasts, managing properties and tenants, service charges, and reading your revenue summary. What would you like to know?`,
      };
    }

    if (this.wantsHelpOverview(lower)) {
      return { reply: this.buildHelpReply(firstName) };
    }

    if (this.isAccountQuestion(lower)) {
      return {
        reply: `You are signed in as ${fullName} (${email}). For password or email changes, use your account settings or the sign-in help flow your organization provides.`,
      };
    }

    const needPaymentContext =
      this.isPaymentTopic(lower) || this.isRevenueTopic(lower);
    const needTenantContext = this.isTenantTopic(lower) || this.isPropertyTopic(lower);
    const needMaintenanceContext = this.isMaintenanceTopic(lower);

    let paymentStats: { pending: number; collectedMtd: number; paymentCount: number } | null =
      null;
    let tenantTotal: number | null = null;
    let propertyCount: number | null = null;
    let maintenanceRows: ManagerMaintenanceRequestRow[] | null = null;

    if (needPaymentContext) {
      paymentStats = await this.loadPaymentStats(managerUserId);
    }
    if (needTenantContext || needPaymentContext) {
      const [portfolio, tenants] = await Promise.all([
        this.managersPortfolioService.getPortfolioSummary(managerUserId),
        this.managersTenantsService.listTenants(managerUserId, {
          page: 1,
          limit: 1,
        }),
      ]);
      propertyCount = portfolio.propertyCount;
      tenantTotal = tenants.total;
    }
    if (needMaintenanceContext) {
      maintenanceRows =
        await this.managersMaintenanceRequestsService.listForManager(managerUserId);
    }

    if (this.isPaymentTopic(lower)) {
      return {
        reply: this.buildPaymentReply(firstName, paymentStats),
      };
    }

    if (this.isRevenueTopic(lower)) {
      return {
        reply: this.buildRevenueReply(firstName, paymentStats),
      };
    }

    if (this.isMaintenanceTopic(lower)) {
      return {
        reply: this.buildMaintenanceReply(firstName, maintenanceRows ?? []),
      };
    }

    if (this.isRenewalTopic(lower)) {
      return { reply: this.buildRenewalReply(firstName) };
    }

    if (this.isServiceChargeTopic(lower)) {
      return { reply: this.buildServiceChargeReply(firstName) };
    }

    if (this.isNotificationTopic(lower)) {
      return { reply: this.buildNotificationReply(firstName) };
    }

    if (this.isTenantTopic(lower)) {
      return {
        reply: this.buildTenantReply(firstName, tenantTotal, propertyCount),
      };
    }

    if (this.isPropertyTopic(lower)) {
      return {
        reply: this.buildPropertyReply(firstName, propertyCount),
      };
    }

    if (this.isTaskTopic(lower)) {
      return { reply: this.buildTaskReply(firstName) };
    }

    if (this.isLeaseFormTopic(lower)) {
      return { reply: this.buildLeaseFormReply(firstName) };
    }

    return {
      reply: `Hi ${firstName} — I’m not sure I caught that yet.

${this.buildHelpReply(firstName)}`,
    };
  }

  private async loadPaymentStats(managerUserId: string): Promise<{
    pending: number;
    collectedMtd: number;
    paymentCount: number;
  }> {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    if (rosterIds.length === 0) {
      return { pending: 0, collectedMtd: 0, paymentCount: 0 };
    }

    try {
      const pending = await this.paymentConfirmationsRepository
        .createQueryBuilder('pc')
        .where('pc.manager_user_id = :managerUserId', { managerUserId })
        .andWhere('pc.tenant_id IN (:...rosterIds)', { rosterIds })
        .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.PENDING })
        .getCount();

      const mtdRows = await this.paymentConfirmationsRepository
        .createQueryBuilder('pc')
        .select('pc.amount_display', 'amountDisplay')
        .where('pc.manager_user_id = :managerUserId', { managerUserId })
        .andWhere('pc.tenant_id IN (:...rosterIds)', { rosterIds })
        .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.CONFIRMED })
        .andWhere('pc.confirmed_at IS NOT NULL')
        .andWhere(`date_trunc('month', pc.confirmed_at) = date_trunc('month', now())`)
        .getRawMany<{ amountDisplay: string | null }>();

      let collectedMtd = 0;
      for (const row of mtdRows) {
        collectedMtd += parseAmountDisplay(row.amountDisplay);
      }
      collectedMtd = Math.round(collectedMtd * 100) / 100;

      return {
        pending,
        collectedMtd,
        paymentCount: mtdRows.length,
      };
    } catch {
      return { pending: 0, collectedMtd: 0, paymentCount: 0 };
    }
  }

  private isGreeting(lower: string): boolean {
    return /^(hi|hello|hey)\b/i.test(lower.trim());
  }

  private wantsHelpOverview(lower: string): boolean {
    return /\b(help|what can you|what do you do|capabilities|options)\b/i.test(lower);
  }

  private isAccountQuestion(lower: string): boolean {
    return (
      /\b(my name|who am i|my email|signed in as|my account)\b/i.test(lower) ||
      (/\b(email|profile)\b/i.test(lower) && /\b(my|me)\b/i.test(lower))
    );
  }

  private isPaymentTopic(lower: string): boolean {
    return /\b(payment|receipt|confirm|pending|submitted|paid|tenant paid)\b/i.test(lower);
  }

  private isRevenueTopic(lower: string): boolean {
    return /\b(revenue|collected|scheduled|mtd|last month|closed)\b/i.test(lower);
  }

  private isMaintenanceTopic(lower: string): boolean {
    return /\b(maintenance|repair|work order|ticket|request|triage)\b/i.test(lower);
  }

  private isRenewalTopic(lower: string): boolean {
    return /\b(renewal|renew|rent increase|rent notice)\b/i.test(lower);
  }

  private isServiceChargeTopic(lower: string): boolean {
    return /\b(service charge|fee|fees|building charge)\b/i.test(lower);
  }

  private isNotificationTopic(lower: string): boolean {
    return /\b(broadcast|alert|notification|notify|message tenants)\b/i.test(lower);
  }

  private isTenantTopic(lower: string): boolean {
    return /\b(tenant|resident|occupancy|roster|add tenant|onboard)\b/i.test(lower);
  }

  private isPropertyTopic(lower: string): boolean {
    return /\b(property|properties|building|portfolio|bank account|collection account)\b/i.test(
      lower,
    );
  }

  private isTaskTopic(lower: string): boolean {
    return /\b(task|tasks|todo|to-do|checklist)\b/i.test(lower);
  }

  private isLeaseFormTopic(lower: string): boolean {
    return /\b(lease form|acknowledgment|acknowledgement|signed form|resident form)\b/i.test(
      lower,
    );
  }

  private buildHelpReply(firstName: string): string {
    return `Here’s what I can help with, ${firstName}:

• **Payments** — review tenant receipt submissions in **Alerts**, confirm payments, and see **Collected MTD** update live.

• **Revenue** — **Collected MTD**, **Scheduled MTD**, and **Last month (closed)** at the top of your dashboard.

• **Maintenance** — triage tenant repair requests and update status (tenants get an alert automatically).

• **Tenants** — **Occupancy** directory, **Add tenant** wizard, and per-property tenant lists with **rent paid** badges.

• **Renewals** — send rent renewal notices from the **Renewals** section (tenants see them in Alerts).

• **Service charges** — publish building fee lines; tenants see them on their dashboard.

• **Properties** — manage buildings and set the bank account tenants pay into.

• **Broadcasts** — send portfolio-wide notices from **Alerts**.

Ask however you like—for example: “Any pending payments?” “How do I send a renewal?” or “Open maintenance queue.”`;
  }

  private buildPaymentReply(
    firstName: string,
    stats: { pending: number; collectedMtd: number; paymentCount: number } | null,
  ): string {
    const pending = stats?.pending ?? 0;
    const collected = stats?.collectedMtd ?? 0;
    const count = stats?.paymentCount ?? 0;

    const pendingLine =
      pending > 0
        ? `You have **${pending}** payment receipt${pending === 1 ? '' : 's'} waiting for confirmation in **Alerts**. Open the row, review the receipt image, and click **Confirm payment received**—the tenant is notified and your revenue cards refresh automatically.`
        : `There are **no pending** payment receipts right now. When a tenant submits rent or a service charge from their dashboard, it appears in **Alerts** for you to confirm.`;

    const collectedLine =
      count > 0
        ? `This month you’ve confirmed **${count}** payment${count === 1 ? '' : 's'} totaling **$${collected.toFixed(2)}** (rent + service charges on your roster).`
        : `No confirmed payments yet this month on your roster—the **Collected MTD** card will fill in as you confirm receipts.`;

    return `Hi ${firstName}.

${pendingLine}

${collectedLine}

Per-property tenant lists under **Properties → [building] → Tenants** show a **Paid / Not paid** badge for each resident’s rent this month.`;
  }

  private buildRevenueReply(
    firstName: string,
    stats: { pending: number; collectedMtd: number; paymentCount: number } | null,
  ): string {
    const collected = stats?.collectedMtd ?? 0;
    const count = stats?.paymentCount ?? 0;

    return `Hi ${firstName}. Your dashboard revenue row has three live cards:

• **Collected MTD** — confirmed rent + service charge payments this calendar month${count > 0 ? ` (**$${collected.toFixed(2)}** from **${count}** payment${count === 1 ? '' : 's'} so far)` : ''}.

• **Scheduled MTD** — outstanding rent and published service charges across your roster (what tenants still owe).

• **Last month (closed)** — total confirmed payments in the previous calendar month.

These update automatically when you confirm a payment or save service charges—no refresh needed.`;
  }

  private buildMaintenanceReply(
    firstName: string,
    rows: ManagerMaintenanceRequestRow[],
  ): string {
    if (rows.length === 0) {
      return `Hi ${firstName}. No maintenance requests on your roster yet. When tenants submit issues from their app, they appear in the **Maintenance** section on your dashboard—open a row to change status and the tenant gets an alert.`;
    }

    const submitted = rows.filter((r) => r.status === 'submitted').length;
    const active = rows.filter((r) => r.status !== 'resolved').length;
    const preview = rows
      .slice(0, 5)
      .map((r) => {
        const who = r.tenantFullName?.trim() || r.tenantEmail || 'Tenant';
        return `• ${r.title} — ${who} (${formatStatusForAssistant(r.status)})`;
      })
      .join('\n');

    return `Hi ${firstName}. You have **${rows.length}** maintenance request${rows.length === 1 ? '' : 's'} on your roster; **${active}** still open and **${submitted}** newly submitted.

${preview}${rows.length > 5 ? `\n…plus ${rows.length - 5} more in the full queue.` : ''}

Open **Maintenance** on your dashboard (or the dedicated maintenance page) to update status—**Submitted → Reviewing → In progress → Resolved**. Tenants see updates in their Alerts automatically.`;
  }

  private buildRenewalReply(firstName: string): string {
    return `Hi ${firstName}. Send rent renewal notices from the **Renewals** section on your dashboard.

Choose recipients, enter the proposed monthly rent and effective date, then send. Tenants receive an in-app alert (and email when configured). Their **Upcoming rent** card updates with the new amount.`;
  }

  private buildServiceChargeReply(firstName: string): string {
    return `Hi ${firstName}. Publish building service charges from the **Service charges** panel on your dashboard (or the dedicated service charges page on mobile).

Pick a property, add fee line items, and save. Affected tenants get an alert and their service charge card refreshes live. Amounts roll into your **Scheduled MTD** revenue summary.`;
  }

  private buildNotificationReply(firstName: string): string {
    return `Hi ${firstName}. Your **Alerts** feed on the dashboard shows:

• Tenant payment receipts awaiting confirmation
• Property broadcasts you’ve sent
• Live banners when tenants submit maintenance or lease forms

Use **Send broadcast** to message all roster tenants at once. Payment and revenue cards refresh automatically when activity comes in.`;
  }

  private buildTenantReply(
    firstName: string,
    tenantTotal: number | null,
    propertyCount: number | null,
  ): string {
    const tenants = tenantTotal ?? 0;
    const properties = propertyCount ?? 0;

    return `Hi ${firstName}. You have **${tenants}** tenant${tenants === 1 ? '' : 's'} across **${properties}** propert${properties === 1 ? 'y' : 'ies'} on your roster.

• **Occupancy** — search and filter your full directory.
• **Add tenant** — onboarding wizard from the nav or dashboard drawer.
• **Properties → [building] → Tenants** — see who lives where and whether rent is **Paid** or **Not paid** this month.

Assign each tenant to a property name that matches your portfolio so they appear on the right roster.`;
  }

  private buildPropertyReply(firstName: string, propertyCount: number | null): string {
    const count = propertyCount ?? 0;
    return `Hi ${firstName}. You manage **${count}** propert${count === 1 ? 'y' : 'ies'} in EstateFlow.

Open **Properties** to add or edit buildings, set addresses, and configure the **payment collection account** (bank details tenants see when they pay).

Tap a property row to see its tenant roster and rent-paid status for each resident.`;
  }

  private buildTaskReply(firstName: string): string {
    return `Hi ${firstName}. Open **Tasks** from the dashboard nav for your task workspace—filters, add items, and mark complete.

On the web, tasks are saved in this browser for now. On mobile, adding a task can optionally notify selected tenants.`;
  }

  private buildLeaseFormReply(firstName: string): string {
    return `Hi ${firstName}. When a tenant submits the resident lease acknowledgment form, you’ll see a live banner on the dashboard.

Tenants complete the form under **Lease** on their portal. You receive a real-time alert here; download their signed PDF from the tenant lease API when needed.`;
  }
}

function firstToken(fullName?: string | null): string | undefined {
  const t = fullName?.trim();
  if (!t) {
    return undefined;
  }
  return t.split(/\s+/)[0];
}

function formatStatusForAssistant(status: string): string {
  const s = status.toLowerCase();
  if (s === 'resolved') {
    return 'Resolved';
  }
  if (s === 'in_progress') {
    return 'In progress';
  }
  if (s === 'reviewing') {
    return 'Reviewing';
  }
  return 'Submitted';
}

function parseAmountDisplay(raw: string | null | undefined): number {
  if (!raw) {
    return 0;
  }
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
