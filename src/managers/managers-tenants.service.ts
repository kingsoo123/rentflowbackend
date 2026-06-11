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

    const items: TenantListItem[] = rows.map((r) => {
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
