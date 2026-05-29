import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListManagersTenantsQueryDto } from './dto/list-managers-tenants.query.dto';
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

@Injectable()
export class ManagersTenantsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
  ) {}

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

  async listTenants(query: ListManagersTenantsQueryDto): Promise<TenantsListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const property = query.property?.trim();

    const qb = this.usersRepository
      .createQueryBuilder('u')
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .where('u.role = :role', { role: UserRole.TENANT });

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

  async getTenantDetail(id: string): Promise<TenantDetailResult> {
    const user = await this.usersRepository.findOne({
      where: { id, role: UserRole.TENANT },
    });
    if (!user) {
      throw new NotFoundException('Tenant not found');
    }

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
}
