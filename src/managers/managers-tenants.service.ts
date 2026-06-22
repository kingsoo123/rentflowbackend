import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { sanitizeUserText } from '../common/sanitize-user-text';
import { ListManagersTenantsQueryDto } from './dto/list-managers-tenants.query.dto';
import type { PatchTenantDto } from './dto/patch-tenant.dto';
import { Property } from '../properties/property.entity';
import { PaymentConfirmationStatus } from '../payment-confirmations/payment-confirmation-status.enum';
import { PaymentType } from '../payment-confirmations/payment-type.enum';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { isServiceChargeAmountVisible } from '../service-charges/service-charge-publish';
import { ServiceChargeLine } from '../service-charges/service-charge-line.entity';
import { TenantNotification } from '../tenant-notifications/tenant-notification.entity';
import { mergeRenewalSummaryFromNotices } from '../tenant-notifications/renewal-rent-display';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

export type TenantListItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  propertyAssigned: string | null;
  unitNumber: string | null;
  rentAmount: string | null;
  renewalEffectiveDate: string | null;
  renewalMonthlyRentDisplay: string | null;
  rentPaymentStatusLabel: string;
  serviceChargePaymentStatusLabel: string;
};

export type TenantsListResult = {
  items: TenantListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type TenantDetailResult = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: Date;
  profile: Record<string, unknown>;
};

function strFromProfile(
  profile: unknown,
  key: string,
): string | null {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return null;
  }
  const v = (profile as Record<string, unknown>)[key];
  if (v === undefined || v === null) {
    return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

function escapeIlike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function mergeProfilePatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, rawVal] of Object.entries(patch)) {
    if (rawVal === null || rawVal === undefined) {
      delete merged[key];
      continue;
    }
    if (typeof rawVal === 'string') {
      const t = sanitizeUserText(rawVal);
      if (t === '') {
        delete merged[key];
      } else {
        merged[key] = t;
      }
      continue;
    }
    if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
      merged[key] = rawVal;
    }
  }
  return merged;
}

@Injectable()
export class ManagersTenantsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(TenantNotification)
    private readonly notificationsRepository: Repository<TenantNotification>,
    @InjectRepository(TenantPaymentConfirmation)
    private readonly paymentConfirmationsRepository: Repository<TenantPaymentConfirmation>,
    @InjectRepository(ServiceChargeLine)
    private readonly serviceChargeLineRepository: Repository<ServiceChargeLine>,
  ) {}

  /**
   * Ensures `profile.propertyAssigned` is non-empty and matches a `properties` row
   * for this manager (case-insensitive, trimmed).
   */
  async validatePropertyAssignedForManager(
    managerUserId: string,
    propertyAssignedRaw: string,
  ): Promise<void> {
    const normalized = propertyAssignedRaw.trim().toLowerCase();
    if (normalized.length === 0) {
      throw new BadRequestException(
        'Each tenant must be assigned to a property. Set propertyAssigned to one of the properties on your portfolio.',
      );
    }
    const count = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.managerUserId = :mid', { mid: managerUserId })
      .andWhere('LOWER(TRIM(p.name)) = :n', { n: normalized })
      .getCount();
    if (count === 0) {
      throw new BadRequestException(
        'propertyAssigned must match a property name in your portfolio (same name as when you registered as a manager; case and surrounding spaces are ignored).',
      );
    }
  }

  /** Used before `POST /api/managers/tenants` so new tenants are always tied to a managed property. */
  async assertCreateTenantProfileAllowedForManager(
    managerUserId: string,
    profile: Record<string, unknown> | undefined,
  ): Promise<void> {
    const raw = profile?.['propertyAssigned'];
    const s = typeof raw === 'string' ? raw : '';
    await this.validatePropertyAssignedForManager(managerUserId, s);
  }

  /**
   * Property manager user ids whose occupancy roster includes this tenant
   * (same `propertyAssigned` ↔ `properties.name` rules as `GET /api/managers/tenants`).
   */
  async listManagerUserIdsForTenantOnRoster(tenantId: string): Promise<string[]> {
    const rows = await this.propertyRepository
      .createQueryBuilder('p')
      .select('p.manager_user_id', 'managerUserId')
      .distinct(true)
      .innerJoin(TenantProfile, 'tp', 'tp.user_id = :tenantId', { tenantId })
      .innerJoin(User, 'u', 'u.id = tp.user_id AND u.role = :role', {
        role: UserRole.TENANT,
      })
      .where(
        `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))`,
      )
      .getRawMany<{ managerUserId: string }>();
    return rows.map((r) => r.managerUserId).filter(Boolean);
  }

  async assertTenantBelongsToManager(
    managerUserId: string,
    tenantUserId: string,
  ): Promise<void> {
    const count = await this.usersRepository
      .createQueryBuilder('u')
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .where('u.id = :id', { id: tenantUserId })
      .andWhere('u.role = :role', { role: UserRole.TENANT })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM properties p
          WHERE p.manager_user_id = :managerUserId
            AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
        )`,
        { managerUserId },
      )
      .getCount();
    if (count === 0) {
      throw new NotFoundException('Tenant not found');
    }
  }

  /** Distinct tenant user ids on this manager’s occupancy roster (same rules as `GET /api/managers/tenants`). */
  async listTenantIdsOnManagerRoster(
    managerUserId: string,
    limit = 200,
  ): Promise<string[]> {
    const rows = await this.usersRepository
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .where('u.role = :role', { role: UserRole.TENANT })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM properties p
          WHERE p.manager_user_id = :managerUserId
            AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
        )`,
        { managerUserId },
      )
      .orderBy('u.createdAt', 'DESC')
      .take(limit)
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id).filter(Boolean);
  }

  /**
   * Whether an account from self-service signup exists for this email as role `tenant`.
   * Used before managers enrich onboarding data for a resident who must register first.
   */
  async checkTenantEmailRegistered(email: string): Promise<{
    existsAsTenant: boolean;
    hasAccount: boolean;
  }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.usersRepository.findOne({
      where: { email: normalized },
    });
    if (!user) {
      return { existsAsTenant: false, hasAccount: false };
    }
    return {
      hasAccount: true,
      existsAsTenant: user.role === UserRole.TENANT,
    };
  }

  async listTenants(
    managerUserId: string,
    query: ListManagersTenantsQueryDto,
  ): Promise<TenantsListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const property = query.property?.trim();
    const propertyId = query.propertyId?.trim();
    let propertyFilterName: string | null = null;
    if (propertyId) {
      const owned = await this.propertyRepository.findOne({
        where: { id: propertyId, managerUserId },
        select: ['id', 'name'],
      });
      if (!owned) {
        return { items: [], total: 0, page, limit, totalPages: 1 };
      }
      propertyFilterName = owned.name;
    }

    const qb = this.usersRepository
      .createQueryBuilder('u')
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .where('u.role = :role', { role: UserRole.TENANT })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM properties p
          WHERE p.manager_user_id = :managerUserId
            AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
        )`,
        { managerUserId },
      );

    if (search) {
      const term = `%${escapeIlike(search)}%`;
      qb.andWhere(
        `(u.email ILIKE :term ESCAPE '\\' OR u.fullName ILIKE :term ESCAPE '\\' OR COALESCE(tp.profile_data->>'phone','') ILIKE :term ESCAPE '\\' OR COALESCE(tp.profile_data->>'propertyAssigned','') ILIKE :term ESCAPE '\\' OR COALESCE(tp.profile_data->>'rentAmount','') ILIKE :term ESCAPE '\\')`,
        { term },
      );
    }

    if (property) {
      const prop = `%${escapeIlike(property)}%`;
      qb.andWhere(
        `COALESCE(tp.profile_data->>'propertyAssigned','') ILIKE :prop ESCAPE '\\'`,
        { prop },
      );
    }

    if (propertyFilterName) {
      qb.andWhere(
        `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(:exactPropName))`,
        { exactPropName: propertyFilterName },
      );
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .select('u.id', 'id')
      .addSelect('u.email', 'email')
      .addSelect('u.fullName', 'fullName')
      .addSelect('tp.profile_data', 'profileData')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{
        id: string;
        email: string;
        fullName: string;
        profileData: Record<string, unknown> | string | null;
      }>();

    const baseItems = rows.map((r) => {
      let profile: unknown = r.profileData;
      if (typeof profile === 'string') {
        try {
          profile = JSON.parse(profile) as Record<string, unknown>;
        } catch {
          profile = {};
        }
      }
      return {
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        phone: strFromProfile(profile, 'phone'),
        propertyAssigned: strFromProfile(profile, 'propertyAssigned'),
        unitNumber: strFromProfile(profile, 'unitNumber'),
        rentAmount: strFromProfile(profile, 'rentAmount'),
        renewalEffectiveDate: null as string | null,
        renewalMonthlyRentDisplay: null as string | null,
        rentPaymentStatusLabel: '—',
        serviceChargePaymentStatusLabel: '—',
      };
    });

    const items = await this.enrichTenantListItems(managerUserId, baseItems);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getTenantDetail(
    managerUserId: string,
    id: string,
  ): Promise<TenantDetailResult> {
    const user = await this.usersRepository.findOne({
      where: { id, role: UserRole.TENANT },
    });
    if (!user) {
      throw new NotFoundException('Tenant not found');
    }
    await this.assertTenantBelongsToManager(managerUserId, id);

    const tp = await this.tenantProfileRepository.findOne({
      where: { userId: id },
    });

    const profile =
      tp?.profileData &&
      typeof tp.profileData === 'object' &&
      !Array.isArray(tp.profileData)
        ? (tp.profileData as Record<string, unknown>)
        : {};

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
      profile,
    };
  }

  async updateTenant(
    managerUserId: string,
    id: string,
    dto: PatchTenantDto,
  ): Promise<TenantDetailResult> {
    const hasAny =
      dto.name !== undefined ||
      dto.email !== undefined ||
      dto.profile !== undefined;
    if (!hasAny) {
      throw new BadRequestException('No updates provided');
    }

    const user = await this.usersRepository.findOne({
      where: { id, role: UserRole.TENANT },
    });
    if (!user) {
      throw new NotFoundException('Tenant not found');
    }
    await this.assertTenantBelongsToManager(managerUserId, id);

    if (dto.email !== undefined) {
      const normalized = dto.email.trim().toLowerCase();
      const other = await this.usersRepository.findOne({
        where: { email: normalized },
      });
      if (other && other.id !== id) {
        throw new ConflictException('An account with this email already exists');
      }
    }

    const userPatch: Partial<{ fullName: string; email: string }> = {};
    if (dto.name !== undefined) {
      userPatch.fullName = dto.name.trim();
    }
    if (dto.email !== undefined) {
      userPatch.email = dto.email.trim().toLowerCase();
    }
    if (Object.keys(userPatch).length > 0) {
      await this.usersRepository.update({ id }, userPatch);
    }

    if (dto.profile !== undefined) {
      const tp = await this.tenantProfileRepository.findOne({
        where: { userId: id },
      });
      const existing =
        tp?.profileData &&
        typeof tp.profileData === 'object' &&
        !Array.isArray(tp.profileData)
          ? ({ ...(tp.profileData as Record<string, unknown>) } as Record<
              string,
              unknown
            >)
          : {};

      const merged = mergeProfilePatch(existing, dto.profile);
      const pa = merged['propertyAssigned'];
      await this.validatePropertyAssignedForManager(
        managerUserId,
        typeof pa === 'string' ? pa : String(pa ?? ''),
      );

      if (tp) {
        tp.profileData = merged;
        await this.tenantProfileRepository.save(tp);
      } else {
        await this.tenantProfileRepository.save(
          this.tenantProfileRepository.create({
            userId: id,
            profileData: merged,
          }),
        );
      }
    }

    return this.getTenantDetail(managerUserId, id);
  }

  private normalizeRenewalDate(value: unknown): string | null {
    if (value == null) {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
    return null;
  }

  private async enrichTenantListItems(
    managerUserId: string,
    items: TenantListItem[],
  ): Promise<TenantListItem[]> {
    if (items.length === 0) {
      return items;
    }

    const tenantIds = items.map((i) => i.id);

    const renewalRows = await this.notificationsRepository.find({
      where: { tenantId: In(tenantIds), kind: 'rent_renewal' },
      order: { createdAt: 'DESC' },
      select: [
        'tenantId',
        'renewalMonthlyRentDisplay',
        'renewalEffectiveDate',
        'body',
      ],
    });
    const renewalByTenant = new Map<
      string,
      { renewalMonthlyRentDisplay: string | null; renewalEffectiveDate: string | null }
    >();
    const rowsByTenant = new Map<string, typeof renewalRows>();
    for (const row of renewalRows) {
      const list = rowsByTenant.get(row.tenantId) ?? [];
      list.push(row);
      rowsByTenant.set(row.tenantId, list);
    }
    for (const [tenantId, rows] of rowsByTenant) {
      renewalByTenant.set(
        tenantId,
        mergeRenewalSummaryFromNotices(rows, (value) =>
          this.normalizeRenewalDate(value),
        ),
      );
    }

    const rentConfirmedRows = await this.paymentConfirmationsRepository
      .createQueryBuilder('pc')
      .select('pc.tenant_id', 'tenantId')
      .where('pc.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('pc.payment_type = :paymentType', { paymentType: PaymentType.RENT })
      .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.CONFIRMED })
      .andWhere('pc.confirmed_at IS NOT NULL')
      .andWhere(`date_trunc('month', pc.confirmed_at) = date_trunc('month', now())`)
      .getRawMany<{ tenantId: string }>();
    const rentConfirmed = new Set(rentConfirmedRows.map((r) => r.tenantId));

    const scConfirmedRows = await this.paymentConfirmationsRepository
      .createQueryBuilder('pc')
      .select('pc.tenant_id', 'tenantId')
      .where('pc.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('pc.payment_type = :paymentType', {
        paymentType: PaymentType.SERVICE_CHARGE,
      })
      .andWhere('pc.status = :status', { status: PaymentConfirmationStatus.CONFIRMED })
      .andWhere('pc.confirmed_at IS NOT NULL')
      .andWhere(`date_trunc('month', pc.confirmed_at) = date_trunc('month', now())`)
      .getRawMany<{ tenantId: string }>();
    const scConfirmed = new Set(scConfirmedRows.map((r) => r.tenantId));

    const propertyNames = [
      ...new Set(
        items
          .map((i) => i.propertyAssigned?.trim().toLowerCase())
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    const lineCountByProperty = new Map<string, number>();
    if (propertyNames.length > 0) {
      const lineRows = await this.serviceChargeLineRepository
        .createQueryBuilder('scl')
        .innerJoin(Property, 'p', 'p.id = scl.property_id')
        .select('LOWER(TRIM(p.name))', 'propertyName')
        .addSelect('COUNT(scl.id)', 'lineCount')
        .where('p.manager_user_id = :managerUserId', { managerUserId })
        .andWhere('LOWER(TRIM(p.name)) IN (:...propertyNames)', { propertyNames })
        .groupBy('LOWER(TRIM(p.name))')
        .getRawMany<{ propertyName: string; lineCount: string }>();
      for (const row of lineRows) {
        const count = Number.parseInt(row.lineCount, 10);
        lineCountByProperty.set(row.propertyName, Number.isFinite(count) ? count : 0);
      }
    }

    const chargesVisible = isServiceChargeAmountVisible();

    return items.map((item) => {
      const renewal = renewalByTenant.get(item.id);
      const renewalMonthlyRentDisplay = renewal?.renewalMonthlyRentDisplay ?? null;
      const renewalEffectiveDate = renewal?.renewalEffectiveDate ?? null;

      let rentPaymentStatusLabel = 'Not on file';
      if (rentConfirmed.has(item.id)) {
        rentPaymentStatusLabel = 'Paid this month';
      } else if (renewalMonthlyRentDisplay || item.rentAmount) {
        rentPaymentStatusLabel = 'Due';
      }

      const propKey = item.propertyAssigned?.trim().toLowerCase() ?? '';
      const lineCount = propKey ? lineCountByProperty.get(propKey) ?? 0 : 0;
      let serviceChargePaymentStatusLabel = 'Not published';
      if (scConfirmed.has(item.id)) {
        serviceChargePaymentStatusLabel = 'Paid this month';
      } else if (lineCount > 0) {
        serviceChargePaymentStatusLabel = chargesVisible
          ? 'Due'
          : 'Publishes on the 25th';
      }

      return {
        ...item,
        renewalMonthlyRentDisplay,
        renewalEffectiveDate,
        rentPaymentStatusLabel,
        serviceChargePaymentStatusLabel,
      };
    });
  }
}
