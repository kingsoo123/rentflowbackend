import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { FcmPushService } from '../firebase/fcm-push.service';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { MaintenanceRealtimeService } from '../maintenance/maintenance-realtime.service';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { ServiceChargesService } from '../service-charges/service-charges.service';
import { PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX } from '../uploads/upload-storage';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import type { SubmitPaymentConfirmationDto } from './dto/submit-payment-confirmation.dto';
import { PaymentConfirmationStatus } from './payment-confirmation-status.enum';
import { PaymentType } from './payment-type.enum';
import { TenantPaymentConfirmation } from './tenant-payment-confirmation.entity';
import { PaymentReceiptPdfService } from './payment-receipt-pdf.service';

export type TenantCollectionAccount = {
  propertyName: string | null;
  managerName: string;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  paymentInstructions: string | null;
};

export type SubmittedPaymentConfirmation = {
  id: string;
  paymentType: PaymentType;
  amountDisplay: string | null;
  receiptImagePath: string;
  status: PaymentConfirmationStatus;
  createdAt: Date;
};

export type ManagerPaymentConfirmationRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  paymentType: PaymentType;
  amountDisplay: string | null;
  receiptImagePath: string;
  status: PaymentConfirmationStatus;
  createdAt: Date;
  confirmedAt: Date | null;
};

export type TenantPaymentHistoryRow = {
  id: string;
  paymentType: PaymentType;
  amountDisplay: string | null;
  status: PaymentConfirmationStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  description: string;
};

const RECEIPT_PATH_PREFIX = PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX;

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

function paymentTypeLabel(type: PaymentType): string {
  return type === PaymentType.SERVICE_CHARGE ? 'service charge' : 'rent';
}

function parseAmountDisplay(raw: string | null | undefined): number {
  if (!raw?.trim()) {
    return 0;
  }
  const cleaned = raw.trim().replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class TenantPaymentConfirmationsService {
  private readonly logger = new Logger(TenantPaymentConfirmationsService.name);

  constructor(
    @InjectRepository(TenantPaymentConfirmation)
    private readonly confirmationsRepository: Repository<TenantPaymentConfirmation>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly maintenanceRealtime: MaintenanceRealtimeService,
    private readonly fcmPush: FcmPushService,
    private readonly tenantNotificationsService: TenantNotificationsService,
    private readonly serviceChargesService: ServiceChargesService,
    private readonly paymentReceiptPdfService: PaymentReceiptPdfService,
  ) {}

  private rethrowIfMissingTable(err: unknown): void {
    if (!(err instanceof QueryFailedError)) {
      return;
    }
    const code = pgErrorCode(err);
    if (
      code === '42P01' ||
      (err.message.includes('relation') && err.message.includes('does not exist'))
    ) {
      throw new ServiceUnavailableException(
        'Database is missing payment confirmation tables. From real_estate_backend run: npm run typeorm:migration:run',
      );
    }
  }

  async getCollectionAccountForTenant(tenantId: string): Promise<TenantCollectionAccount> {
    try {
      const row = await this.propertyRepository
        .createQueryBuilder('p')
        .innerJoin(TenantProfile, 'tp', 'tp.user_id = :tenantId', { tenantId })
        .innerJoin(User, 'm', 'm.id = p.manager_user_id')
        .where(
          `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))`,
        )
        .select('p.name', 'propertyName')
        .addSelect('p.collection_bank_name', 'bankName')
        .addSelect('p.collection_account_name', 'accountName')
        .addSelect('p.collection_account_number', 'accountNumber')
        .addSelect('p.collection_payment_instructions', 'paymentInstructions')
        .addSelect('m.full_name', 'managerName')
        .orderBy('p.created_at', 'ASC')
        .limit(1)
        .getRawOne<{
          propertyName: string;
          bankName: string | null;
          accountName: string | null;
          accountNumber: string | null;
          paymentInstructions: string | null;
          managerName: string;
        }>();

      if (!row) {
        throw new NotFoundException(
          'No property assignment found. Ask your property manager to link your unit.',
        );
      }

      return {
        propertyName: row.propertyName?.trim() || null,
        managerName: row.managerName?.trim() || 'Property manager',
        bankName: row.bankName?.trim() || null,
        accountName: row.accountName?.trim() || null,
        accountNumber: row.accountNumber?.trim() || null,
        paymentInstructions: row.paymentInstructions?.trim() || null,
      };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'getCollectionAccountForTenant failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load payment account details.');
    }
  }

  async submitForTenant(
    tenantId: string,
    dto: SubmitPaymentConfirmationDto,
  ): Promise<SubmittedPaymentConfirmation> {
    const receiptPath = dto.receiptPath.trim();
    if (!receiptPath.startsWith(RECEIPT_PATH_PREFIX)) {
      throw new BadRequestException('Invalid receipt path');
    }
    const filename = receiptPath.slice(RECEIPT_PATH_PREFIX.length);
    if (!filename || filename.includes('/') || filename.includes('..')) {
      throw new BadRequestException('Invalid receipt path');
    }

    const propertyRow = await this.propertyRepository
      .createQueryBuilder('p')
      .innerJoin(TenantProfile, 'tp', 'tp.user_id = :tenantId', { tenantId })
      .where(
        `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))`,
      )
      .select('p.id', 'id')
      .addSelect('p.manager_user_id', 'managerUserId')
      .orderBy('p.created_at', 'ASC')
      .limit(1)
      .getRawOne<{ id: string; managerUserId: string }>();

    if (!propertyRow?.managerUserId) {
      throw new NotFoundException(
        'No property assignment found. Ask your property manager to link your unit.',
      );
    }

    const amountDisplay = dto.amountDisplay?.trim() || null;

    try {
      const entity = this.confirmationsRepository.create({
        tenantId,
        managerUserId: propertyRow.managerUserId,
        propertyId: propertyRow.id ?? null,
        paymentType: dto.paymentType,
        amountDisplay,
        receiptImagePath: receiptPath,
        status: PaymentConfirmationStatus.PENDING,
      });
      const saved = await this.confirmationsRepository.save(entity);

      const user = await this.usersRepository.findOne({
        where: { id: tenantId },
        select: ['id', 'fullName', 'email'],
      });
      const tenantName = user?.fullName?.trim() || user?.email?.trim() || 'A tenant';

      const managerUserIds =
        await this.managersTenantsService.listManagerUserIdsForTenantOnRoster(tenantId);

      this.maintenanceRealtime.notifyPaymentSubmitted(
        {
          id: saved.id,
          tenantId,
          tenantName,
          paymentType: saved.paymentType,
          amountDisplay: saved.amountDisplay,
        },
        managerUserIds,
      );

      const label = paymentTypeLabel(saved.paymentType);
      const amountSuffix = saved.amountDisplay ? ` (${saved.amountDisplay})` : '';
      const title = 'Payment receipt submitted';
      const body = `${tenantName} submitted a ${label} payment receipt${amountSuffix}.`;
      void this.fcmPush.notifyTenantsMulticast(managerUserIds, title, body, {
        kind: 'payment_confirmation_submitted',
        confirmationId: saved.id,
        tenantId,
        paymentType: saved.paymentType,
      });

      return {
        id: saved.id,
        paymentType: saved.paymentType,
        amountDisplay: saved.amountDisplay,
        receiptImagePath: saved.receiptImagePath,
        status: saved.status,
        createdAt: saved.createdAt,
      };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'submitForTenant failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not submit payment confirmation.');
    }
  }

  async listForManager(managerUserId: string): Promise<ManagerPaymentConfirmationRow[]> {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    if (rosterIds.length === 0) {
      return [];
    }

    try {
      const rows = await this.confirmationsRepository.find({
        where: {
          managerUserId,
          tenantId: In(rosterIds),
        },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
      const tenants =
        tenantIds.length === 0
          ? []
          : await this.usersRepository.find({
              where: { id: In(tenantIds), role: UserRole.TENANT },
              select: ['id', 'fullName', 'email'],
            });
      const tenantById = new Map(tenants.map((t) => [t.id, t]));

      return rows.map((r) => {
        const tenant = tenantById.get(r.tenantId);
        return {
          id: r.id,
          tenantId: r.tenantId,
          tenantName: tenant?.fullName?.trim() || tenant?.email?.trim() || 'Tenant',
          tenantEmail: tenant?.email ?? '',
          paymentType: r.paymentType,
          amountDisplay: r.amountDisplay,
          receiptImagePath: r.receiptImagePath,
          status: r.status,
          createdAt: r.createdAt,
          confirmedAt: r.confirmedAt,
        };
      });
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'listForManager failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load payment confirmations.');
    }
  }

  /** Sum of confirmed rent + service charge payments for the current calendar month (manager roster only). */
  async getCollectedMtdForManager(managerUserId: string): Promise<{
    collectedMtd: number;
    paymentCount: number;
  }> {
    const result = await this.sumConfirmedPaymentsForManagerMonth(managerUserId, 'current');
    return { collectedMtd: result.total, paymentCount: result.paymentCount };
  }

  /** Sum of confirmed rent + service charge payments for the previous calendar month (manager roster only). */
  async getClosedLastMonthForManager(managerUserId: string): Promise<{
    closedLastMonth: number;
    paymentCount: number;
    periodLabel: string;
  }> {
    const result = await this.sumConfirmedPaymentsForManagerMonth(managerUserId, 'previous');
    return {
      closedLastMonth: result.total,
      paymentCount: result.paymentCount,
      periodLabel: result.periodLabel,
    };
  }

  private async sumConfirmedPaymentsForManagerMonth(
    managerUserId: string,
    which: 'current' | 'previous',
  ): Promise<{ total: number; paymentCount: number; periodLabel: string }> {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    const periodLabel = this.confirmedPaymentsPeriodLabel(which);
    if (rosterIds.length === 0) {
      return { total: 0, paymentCount: 0, periodLabel };
    }

    const monthMatch =
      which === 'current'
        ? `date_trunc('month', pc.confirmed_at) = date_trunc('month', now())`
        : `date_trunc('month', pc.confirmed_at) = date_trunc('month', now() - interval '1 month')`;

    try {
      const rows = await this.confirmationsRepository
        .createQueryBuilder('pc')
        .where('pc.manager_user_id = :managerUserId', { managerUserId })
        .andWhere('pc.tenant_id IN (:...rosterIds)', { rosterIds })
        .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.CONFIRMED })
        .andWhere('pc.confirmed_at IS NOT NULL')
        .andWhere(monthMatch)
        .getMany();

      let total = 0;
      for (const row of rows) {
        total += parseAmountDisplay(row.amountDisplay);
      }
      return {
        total: Math.round(total * 100) / 100,
        paymentCount: rows.length,
        periodLabel,
      };
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        `sumConfirmedPaymentsForManagerMonth(${which}) failed`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load confirmed payments.');
    }
  }

  private confirmedPaymentsPeriodLabel(which: 'current' | 'previous'): string {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCHours(12, 0, 0, 0);
    if (which === 'previous') {
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  /**
   * Sum of upcoming rent + active service charges for every tenant on the manager roster
   * (same rules as each tenant's current balance card).
   */
  async getScheduledMtdForManager(managerUserId: string): Promise<{
    scheduledMtd: number;
    tenantCount: number;
    obligationCount: number;
  }> {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    if (rosterIds.length === 0) {
      return { scheduledMtd: 0, tenantCount: 0, obligationCount: 0 };
    }

    try {
      let scheduledMtd = 0;
      let obligationCount = 0;

      await Promise.all(
        rosterIds.map(async (tenantId) => {
          const [upcoming, serviceCharges] = await Promise.all([
            this.tenantNotificationsService.getUpcomingRentSummary(tenantId),
            this.serviceChargesService.listForTenant(tenantId),
          ]);

          if (upcoming.source !== 'paid_current_month') {
            const rentDue = parseAmountDisplay(upcoming.monthlyRentDisplay);
            if (rentDue > 0) {
              scheduledMtd += rentDue;
              obligationCount += 1;
            }
          }

          if (serviceCharges.source === 'active' && serviceCharges.lines.length > 0) {
            const serviceDue = serviceCharges.lines.reduce(
              (acc, line) => acc + (Number.isFinite(line.amount) ? line.amount : 0),
              0,
            );
            if (serviceDue > 0) {
              scheduledMtd += serviceDue;
              obligationCount += 1;
            }
          }
        }),
      );

      return {
        scheduledMtd: Math.round(scheduledMtd * 100) / 100,
        tenantCount: rosterIds.length,
        obligationCount,
      };
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'getScheduledMtdForManager failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load scheduled revenue.');
    }
  }

  async getRevenueBreakdownForManager(
    managerUserId: string,
    card: 'collected-mtd' | 'scheduled-mtd' | 'closed-last-month',
  ): Promise<{
    card: typeof card;
    title: string;
    total: number;
    periodLabel: string;
    rentSubtotal: number;
    serviceChargeSubtotal: number;
    lineCount: number;
    howCalculated: string;
    lines: {
      tenantName: string;
      category: 'rent' | 'service_charge';
      label: string;
      amount: number;
      amountDisplay: string | null;
      detail: string | null;
    }[];
  }> {
    if (card === 'scheduled-mtd') {
      return this.buildScheduledMtdBreakdown(managerUserId);
    }
    const which = card === 'collected-mtd' ? 'current' : 'previous';
    return this.buildConfirmedPaymentsBreakdown(managerUserId, which, card);
  }

  private async buildConfirmedPaymentsBreakdown(
    managerUserId: string,
    which: 'current' | 'previous',
    card: 'collected-mtd' | 'closed-last-month',
  ) {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    const periodLabel = this.confirmedPaymentsPeriodLabel(which);
    const title = card === 'collected-mtd' ? 'Collected (MTD)' : 'Last month (closed)';
    const howCalculated =
      card === 'collected-mtd'
        ? `Each line is a payment receipt you confirmed in ${periodLabel}. Amounts use the figure on the receipt (rent or service charge).`
        : `Each line is a payment receipt you confirmed in ${periodLabel}. Amounts use the figure on the receipt (rent or service charge).`;

    if (rosterIds.length === 0) {
      return {
        card,
        title,
        total: 0,
        periodLabel,
        rentSubtotal: 0,
        serviceChargeSubtotal: 0,
        lineCount: 0,
        howCalculated,
        lines: [],
      };
    }

    const monthMatch =
      which === 'current'
        ? `date_trunc('month', pc.confirmed_at) = date_trunc('month', now())`
        : `date_trunc('month', pc.confirmed_at) = date_trunc('month', now() - interval '1 month')`;

    try {
      const rows = await this.confirmationsRepository
        .createQueryBuilder('pc')
        .where('pc.manager_user_id = :managerUserId', { managerUserId })
        .andWhere('pc.tenant_id IN (:...rosterIds)', { rosterIds })
        .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.CONFIRMED })
        .andWhere('pc.confirmed_at IS NOT NULL')
        .andWhere(monthMatch)
        .orderBy('pc.confirmed_at', 'DESC')
        .getMany();

      const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
      const tenants =
        tenantIds.length === 0
          ? []
          : await this.usersRepository.find({
              where: { id: In(tenantIds), role: UserRole.TENANT },
              select: ['id', 'fullName', 'email'],
            });
      const tenantById = new Map(tenants.map((t) => [t.id, t]));

      let rentSubtotal = 0;
      let serviceChargeSubtotal = 0;
      const lines = rows.map((row) => {
        const tenant = tenantById.get(row.tenantId);
        const tenantName = tenant?.fullName?.trim() || tenant?.email?.trim() || 'Tenant';
        const amount = parseAmountDisplay(row.amountDisplay);
        const category =
          row.paymentType === PaymentType.SERVICE_CHARGE ? 'service_charge' : 'rent';
        if (category === 'rent') {
          rentSubtotal += amount;
        } else {
          serviceChargeSubtotal += amount;
        }
        const confirmedAt = row.confirmedAt?.toISOString() ?? null;
        return {
          tenantName,
          category: category as 'rent' | 'service_charge',
          label: category === 'rent' ? 'Rent' : 'Service charge',
          amount,
          amountDisplay: row.amountDisplay?.trim() || null,
          detail: confirmedAt
            ? `Confirmed ${confirmedAt.slice(0, 10)}`
            : null,
        };
      });

      const total = Math.round((rentSubtotal + serviceChargeSubtotal) * 100) / 100;
      rentSubtotal = Math.round(rentSubtotal * 100) / 100;
      serviceChargeSubtotal = Math.round(serviceChargeSubtotal * 100) / 100;

      return {
        card,
        title,
        total,
        periodLabel,
        rentSubtotal,
        serviceChargeSubtotal,
        lineCount: lines.length,
        howCalculated,
        lines,
      };
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        `buildConfirmedPaymentsBreakdown(${card}) failed`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load revenue breakdown.');
    }
  }

  private async buildScheduledMtdBreakdown(managerUserId: string) {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    const periodLabel = this.confirmedPaymentsPeriodLabel('current');
    const title = 'Scheduled (MTD)';
    const howCalculated =
      'For each tenant on your roster, unpaid rent on file plus published service charge line items are added (same rules as each tenant\'s current balance card).';

    if (rosterIds.length === 0) {
      return {
        card: 'scheduled-mtd' as const,
        title,
        total: 0,
        periodLabel,
        rentSubtotal: 0,
        serviceChargeSubtotal: 0,
        lineCount: 0,
        howCalculated,
        lines: [],
      };
    }

    try {
      const tenants = await this.usersRepository.find({
        where: { id: In(rosterIds), role: UserRole.TENANT },
        select: ['id', 'fullName', 'email'],
      });
      const tenantById = new Map(tenants.map((t) => [t.id, t]));

      const lines: {
        tenantName: string;
        category: 'rent' | 'service_charge';
        label: string;
        amount: number;
        amountDisplay: string | null;
        detail: string | null;
      }[] = [];

      await Promise.all(
        rosterIds.map(async (tenantId) => {
          const tenant = tenantById.get(tenantId);
          const tenantName = tenant?.fullName?.trim() || tenant?.email?.trim() || 'Tenant';
          const [upcoming, serviceCharges] = await Promise.all([
            this.tenantNotificationsService.getUpcomingRentSummary(tenantId),
            this.serviceChargesService.listForTenant(tenantId),
          ]);

          if (upcoming.source !== 'paid_current_month') {
            const rentDue = parseAmountDisplay(upcoming.monthlyRentDisplay);
            if (rentDue > 0) {
              lines.push({
                tenantName,
                category: 'rent',
                label: 'Rent',
                amount: rentDue,
                amountDisplay: upcoming.monthlyRentDisplay?.trim() || null,
                detail:
                  upcoming.source === 'renewal_notice'
                    ? 'Renewal notice on file'
                    : upcoming.source === 'profile'
                      ? 'Monthly rent on profile'
                      : 'Upcoming rent',
              });
            }
          }

          if (serviceCharges.source === 'active' && serviceCharges.lines.length > 0) {
            const serviceDue = serviceCharges.lines.reduce(
              (acc, line) => acc + (Number.isFinite(line.amount) ? line.amount : 0),
              0,
            );
            if (serviceDue > 0) {
              const rounded = Math.round(serviceDue * 100) / 100;
              lines.push({
                tenantName,
                category: 'service_charge',
                label: 'Service charge',
                amount: rounded,
                amountDisplay: `$${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
                detail: `${serviceCharges.lines.length} published line item${serviceCharges.lines.length === 1 ? '' : 's'}`,
              });
            }
          }
        }),
      );

      lines.sort((a, b) => {
        const byName = a.tenantName.localeCompare(b.tenantName);
        if (byName !== 0) {
          return byName;
        }
        return a.category.localeCompare(b.category);
      });

      let rentSubtotal = 0;
      let serviceChargeSubtotal = 0;
      for (const line of lines) {
        if (line.category === 'rent') {
          rentSubtotal += line.amount;
        } else {
          serviceChargeSubtotal += line.amount;
        }
      }
      const total = Math.round((rentSubtotal + serviceChargeSubtotal) * 100) / 100;
      rentSubtotal = Math.round(rentSubtotal * 100) / 100;
      serviceChargeSubtotal = Math.round(serviceChargeSubtotal * 100) / 100;

      return {
        card: 'scheduled-mtd' as const,
        title,
        total,
        periodLabel,
        rentSubtotal,
        serviceChargeSubtotal,
        lineCount: lines.length,
        howCalculated,
        lines,
      };
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'buildScheduledMtdBreakdown failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load revenue breakdown.');
    }
  }

  async confirmForManager(
    managerUserId: string,
    confirmationId: string,
  ): Promise<ManagerPaymentConfirmationRow> {
    const row = await this.confirmationsRepository.findOne({
      where: { id: confirmationId, managerUserId },
    });
    if (!row) {
      throw new NotFoundException('Payment confirmation not found');
    }
    await this.managersTenantsService.assertTenantBelongsToManager(
      managerUserId,
      row.tenantId,
    );
    if (row.status === PaymentConfirmationStatus.CONFIRMED) {
      return this.mapManagerRow(row, await this.loadTenantMeta(row.tenantId));
    }

    row.status = PaymentConfirmationStatus.CONFIRMED;
    row.confirmedAt = new Date();
    let saved: TenantPaymentConfirmation;
    try {
      saved = await this.confirmationsRepository.save(row);
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'confirmForManager save failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not confirm payment.');
    }

    const tenantMeta = await this.loadTenantMeta(saved.tenantId);

    this.maintenanceRealtime.notifyRevenueUpdated(managerUserId);

    void this.tenantNotificationsService
      .createPaymentReceivedNotification(
        saved.tenantId,
        saved.paymentType,
        saved.amountDisplay,
        saved.id,
      )
      .catch((err) => {
        this.logger.error(
          'createPaymentReceivedNotification failed',
          err instanceof Error ? err.stack : String(err),
        );
      });

    return this.mapManagerRow(saved, tenantMeta);
  }

  async buildReceiptPdfForTenant(tenantId: string, confirmationId: string): Promise<Buffer> {
    const row = await this.confirmationsRepository.findOne({
      where: { id: confirmationId, tenantId },
    });
    if (!row || row.status !== PaymentConfirmationStatus.CONFIRMED || !row.confirmedAt) {
      throw new NotFoundException('Confirmed payment not found');
    }

    const [tenantUser, managerUser, propertyRow, tenantProfile] = await Promise.all([
      this.usersRepository.findOne({
        where: { id: tenantId },
        select: ['id', 'fullName', 'email'],
      }),
      this.usersRepository.findOne({
        where: { id: row.managerUserId },
        select: ['id', 'fullName', 'email'],
      }),
      row.propertyId
        ? this.propertyRepository.findOne({ where: { id: row.propertyId }, select: ['id', 'name'] })
        : Promise.resolve(null),
      this.tenantProfileRepository.findOne({ where: { userId: tenantId } }),
    ]);

    const profileData =
      tenantProfile?.profileData &&
      typeof tenantProfile.profileData === 'object' &&
      !Array.isArray(tenantProfile.profileData)
        ? (tenantProfile.profileData as Record<string, unknown>)
        : undefined;
    const unitRaw = profileData?.unitNumber;
    const unitNumber =
      typeof unitRaw === 'string' && unitRaw.trim() ? unitRaw.trim() : null;
    const propertyFromProfile = profileData?.propertyAssigned;
    const propertyName =
      propertyRow?.name?.trim() ||
      (typeof propertyFromProfile === 'string' && propertyFromProfile.trim()
        ? propertyFromProfile.trim()
        : null);

    return this.paymentReceiptPdfService.renderReceiptPdf({
      confirmationId: row.id,
      paymentType: row.paymentType,
      amountDisplay: row.amountDisplay,
      confirmedAt: row.confirmedAt,
      submittedAt: row.createdAt,
      tenantFullName: tenantUser?.fullName?.trim() || tenantUser?.email?.trim() || 'Tenant',
      tenantEmail: tenantUser?.email ?? '',
      unitNumber,
      propertyName,
      managerName: managerUser?.fullName?.trim() || managerUser?.email?.trim() || 'Property manager',
    });
  }

  async listPaymentHistoryForTenant(tenantId: string): Promise<TenantPaymentHistoryRow[]> {
    try {
      const rows = await this.confirmationsRepository.find({
        where: { tenantId, status: PaymentConfirmationStatus.CONFIRMED },
        order: { confirmedAt: 'DESC', createdAt: 'DESC' },
        take: 50,
      });
      return rows.map((r) => ({
        id: r.id,
        paymentType: r.paymentType,
        amountDisplay: r.amountDisplay,
        status: r.status,
        createdAt: r.createdAt,
        confirmedAt: r.confirmedAt,
        description:
          r.paymentType === PaymentType.SERVICE_CHARGE
            ? 'Service charge payment'
            : 'Rent payment',
      }));
    } catch (err) {
      this.rethrowIfMissingTable(err);
      this.logger.error(
        'listPaymentHistoryForTenant failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load payment history.');
    }
  }

  /** True when rent for the current calendar month has been confirmed by the manager. */
  async hasConfirmedRentForCurrentMonth(tenantId: string): Promise<boolean> {
    try {
      const count = await this.confirmationsRepository
        .createQueryBuilder('pc')
        .where('pc.tenant_id = :tenantId', { tenantId })
        .andWhere('pc.payment_type = :paymentType', { paymentType: PaymentType.RENT })
        .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.CONFIRMED })
        .andWhere('pc.confirmed_at IS NOT NULL')
        .andWhere(`date_trunc('month', pc.confirmed_at) = date_trunc('month', now())`)
        .getCount();
      return count > 0;
    } catch (err) {
      this.rethrowIfMissingTable(err);
      return false;
    }
  }

  private async loadTenantMeta(tenantId: string): Promise<{ fullName: string; email: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'fullName', 'email'],
    });
    return {
      fullName: user?.fullName?.trim() || user?.email?.trim() || 'Tenant',
      email: user?.email ?? '',
    };
  }

  private mapManagerRow(
    r: TenantPaymentConfirmation,
    tenant: { fullName: string; email: string },
  ): ManagerPaymentConfirmationRow {
    return {
      id: r.id,
      tenantId: r.tenantId,
      tenantName: tenant.fullName,
      tenantEmail: tenant.email,
      paymentType: r.paymentType,
      amountDisplay: r.amountDisplay,
      receiptImagePath: r.receiptImagePath,
      status: r.status,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
    };
  }
}
