import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListManagersTenantsQueryDto } from './dto/list-managers-tenants.query.dto';
import type { PatchTenantDto } from './dto/patch-tenant.dto';
import { Property } from '../properties/property.entity';
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
  /** Latest `rent_renewal` notice effective date (YYYY-MM-DD) when set. */
  renewalEffectiveDate: string | null;
  /** Latest `rent_renewal` proposed rent display when set. */
  renewalMonthlyRentDisplay: string | null;
  /** Manager-facing summary (profile override or heuristic). */
  rentPaymentStatusLabel: string;
  /** Whether building-level service charge lines exist for the assigned property. */
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
      const t = rawVal.trim();
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

  /**
   * Property manager user IDs who have this tenant on their roster (assigned property name
   * matches one of their `properties` rows).
   */
  async listManagerUserIdsForTenantOnRoster(tenantUserId: string): Promise<string[]> {
    const rows = await this.propertyRepository.query<Array<{ mid: string }>>(
      `SELECT DISTINCT p.manager_user_id AS mid
       FROM users u
       INNER JOIN tenant_profiles tp ON tp.user_id = u.id
       INNER JOIN properties p
         ON LOWER(TRIM(p.name)) = LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned', '')))
       WHERE u.id = $1 AND u.role = $2`,
      [tenantUserId, UserRole.TENANT],
    );
    return rows.map((r) => r.mid).filter((x): x is string => Boolean(x));
  }

  /**
   * Tenant user IDs on this manager's occupancy roster (same scope as `GET /api/managers/tenants`).
   */
  async listTenantIdsOnManagerRoster(
    managerUserId: string,
    max: number,
  ): Promise<string[]> {
    const take = Math.min(Math.max(1, max), 500);
    const rows = await this.usersRepository.query<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       LEFT JOIN tenant_profiles tp ON tp.user_id = u.id
       WHERE u.role = $2
         AND EXISTS (
           SELECT 1 FROM properties p
           WHERE p.manager_user_id = $1::uuid
             AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
         )
       ORDER BY u.created_at DESC
       LIMIT $3`,
      [managerUserId, UserRole.TENANT, take],
    );
    return rows.map((r) => r.id);
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

    if (propertyId && property) {
      throw new BadRequestException('Use either propertyId or property, not both.');
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

    if (propertyId) {
      const propRow = await this.propertyRepository.findOne({
        where: { id: propertyId, managerUserId },
      });
      if (!propRow) {
        throw new NotFoundException('Property not found');
      }
      qb.andWhere(
        `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(:_propName))`,
        { _propName: propRow.name },
      );
    } else if (property) {
      const prop = `%${escapeIlike(property)}%`;
      qb.andWhere(
        `COALESCE(tp.profile_data->>'propertyAssigned','') ILIKE :prop ESCAPE '\\'`,
        { prop },
      );
    }

    if (search) {
      const term = `%${escapeIlike(search)}%`;
      qb.andWhere(
        `(u.email ILIKE :term ESCAPE '\\' OR u.fullName ILIKE :term ESCAPE '\\' OR COALESCE(tp.profile_data->>'phone','') ILIKE :term ESCAPE '\\' OR COALESCE(tp.profile_data->>'propertyAssigned','') ILIKE :term ESCAPE '\\' OR COALESCE(tp.profile_data->>'rentAmount','') ILIKE :term ESCAPE '\\')`,
        { term },
      );
    }

    const total = await qb.clone().getCount();

    const rowQb = qb
      .clone()
      .select('u.id', 'id')
      .addSelect('u.email', 'email')
      .addSelect('u.fullName', 'fullName')
      .addSelect('tp.profile_data', 'profileData')
      .addSelect(
        `(
          SELECT TO_CHAR(tn.renewal_effective_date, 'YYYY-MM-DD')
          FROM tenant_notifications tn
          WHERE tn.tenant_id = u.id AND tn.kind = 'rent_renewal'
          ORDER BY tn.created_at DESC
          LIMIT 1
        )`,
        'renewal_effective_date',
      )
      .addSelect(
        `(
          SELECT tn.renewal_monthly_rent_display
          FROM tenant_notifications tn
          WHERE tn.tenant_id = u.id AND tn.kind = 'rent_renewal'
          ORDER BY tn.created_at DESC
          LIMIT 1
        )`,
        'renewal_monthly_rent_display',
      )
      .addSelect(
        `(
          SELECT EXISTS (
            SELECT 1 FROM service_charge_lines scl
            INNER JOIN properties p2 ON p2.id = scl.property_id
            WHERE p2.manager_user_id = :managerUserId
              AND LOWER(TRIM(p2.name)) = LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned','')))
          )
        )`,
        'building_has_service_charges',
      )
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const rows = await rowQb.getRawMany<{
      id: string;
      email: string;
      fullName: string;
      profileData: Record<string, unknown> | string | null;
      renewal_effective_date: string | null;
      renewal_monthly_rent_display: string | null;
      building_has_service_charges: boolean | string | number | null;
    }>();

    const items: TenantListItem[] = rows.map((r) => {
      let profile: unknown = r.profileData;
      if (typeof profile === 'string') {
        try {
          profile = JSON.parse(profile) as Record<string, unknown>;
        } catch {
          profile = {};
        }
      }
      const rentOverride = strFromProfile(profile, 'rentPaymentStatus');
      const rentAmount = strFromProfile(profile, 'rentAmount');
      const rentPaymentStatusLabel =
        rentOverride ??
        (rentAmount ? 'Rent on file (payments not tracked in app)' : 'No rent on file');

      const hasSc =
        r.building_has_service_charges === true ||
        r.building_has_service_charges === 1 ||
        r.building_has_service_charges === '1' ||
        String(r.building_has_service_charges).toLowerCase() === 'true';
      const serviceChargePaymentStatusLabel = hasSc
        ? 'Building charges published — confirm with resident'
        : 'No service charge statement for this building yet';

      const renewalEffectiveDate =
        typeof r.renewal_effective_date === 'string' && r.renewal_effective_date.trim()
          ? r.renewal_effective_date.trim().slice(0, 10)
          : null;
      const renewalMonthlyRentDisplay =
        typeof r.renewal_monthly_rent_display === 'string' && r.renewal_monthly_rent_display.trim()
          ? r.renewal_monthly_rent_display.trim()
          : null;

      return {
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        phone: strFromProfile(profile, 'phone'),
        propertyAssigned: strFromProfile(profile, 'propertyAssigned'),
        unitNumber: strFromProfile(profile, 'unitNumber'),
        rentAmount,
        renewalEffectiveDate,
        renewalMonthlyRentDisplay,
        rentPaymentStatusLabel,
        serviceChargePaymentStatusLabel,
      };
    });

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
}
