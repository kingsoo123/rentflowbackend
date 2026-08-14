import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import type { CreatePropertyDto } from './dto/create-property.dto';
import type { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

export type ManagerPropertyDetail = {
  id: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  collectionBankName: string | null;
  collectionAccountName: string | null;
  collectionAccountNumber: string | null;
  collectionPaymentInstructions: string | null;
  unitCount: number | null;
  createdAt: string;
};

export type ManagerOccupancySummary = {
  occupied: number;
  total: number;
  vacant: number;
  notice: number;
  pct: number;
  propertyCount: number;
  tenantCount: number;
};

export type ManagerPortfolioSummary = {
  accountName: string;
  propertyCount: number;
  occupancy: ManagerOccupancySummary;
};

const NOTICE_WINDOW_DAYS = 60;

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

function emptyToNull(s: string | undefined): string | null {
  if (s === undefined || s === null) {
    return null;
  }
  const t = String(s).trim();
  return t === '' ? null : t;
}

function parseLeaseEndDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) {
    return null;
  }
  const d = new Date(`${t.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class ManagersPortfolioService {
  private readonly logger = new Logger(ManagersPortfolioService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
  ) {}

  private async assertPropertyManager(managerUserId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: managerUserId, role: UserRole.PROPERTY_MANAGER },
    });
    if (!user) {
      throw new NotFoundException('Manager not found');
    }
    return user;
  }

  private mapProperty(p: Property): ManagerPropertyDetail {
    return {
      id: p.id,
      name: p.name,
      addressLine: p.addressLine,
      city: p.city,
      stateRegion: p.stateRegion,
      postalCode: p.postalCode,
      country: p.country,
      collectionBankName: p.collectionBankName,
      collectionAccountName: p.collectionAccountName,
      collectionAccountNumber: p.collectionAccountNumber,
      collectionPaymentInstructions: p.collectionPaymentInstructions,
      unitCount: p.unitCount ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private async computeOccupancy(
    managerUserId: string,
    properties: Property[],
  ): Promise<ManagerOccupancySummary> {
    const propertyCount = properties.length;
    if (propertyCount === 0) {
      return {
        occupied: 0,
        total: 0,
        vacant: 0,
        notice: 0,
        pct: 0,
        propertyCount: 0,
        tenantCount: 0,
      };
    }

    const nameToProperty = new Map<string, Property>();
    for (const p of properties) {
      nameToProperty.set(p.name.trim().toLowerCase(), p);
    }

    const roster = await this.usersRepository
      .createQueryBuilder('u')
      .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .select('u.id', 'id')
      .addSelect('tp.profile_data', 'profileData')
      .where('u.role = :role', { role: UserRole.TENANT })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM properties p
          WHERE p.manager_user_id = :managerUserId
            AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
        )`,
        { managerUserId },
      )
      .getRawMany<{ id: string; profileData: Record<string, unknown> | string | null }>();

    const occupiedByPropertyId = new Map<string, number>();
    for (const p of properties) {
      occupiedByPropertyId.set(p.id, 0);
    }

    const today = startOfUtcDay(new Date());
    const noticeUntil = new Date(today);
    noticeUntil.setUTCDate(noticeUntil.getUTCDate() + NOTICE_WINDOW_DAYS);

    let notice = 0;
    let occupied = 0;

    for (const row of roster) {
      let profile: Record<string, unknown> = {};
      if (row.profileData && typeof row.profileData === 'object' && !Array.isArray(row.profileData)) {
        profile = row.profileData;
      } else if (typeof row.profileData === 'string') {
        try {
          const parsed = JSON.parse(row.profileData) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            profile = parsed as Record<string, unknown>;
          }
        } catch {
          profile = {};
        }
      }

      const assigned =
        typeof profile.propertyAssigned === 'string'
          ? profile.propertyAssigned.trim().toLowerCase()
          : '';
      const prop = assigned ? nameToProperty.get(assigned) : undefined;
      if (!prop) {
        continue;
      }

      occupied += 1;
      occupiedByPropertyId.set(prop.id, (occupiedByPropertyId.get(prop.id) ?? 0) + 1);

      const end = parseLeaseEndDate(profile.leaseEndDate);
      if (end) {
        const endDay = startOfUtcDay(end);
        if (endDay.getTime() >= today.getTime() && endDay.getTime() <= noticeUntil.getTime()) {
          notice += 1;
        }
      }
    }

    let total = 0;
    for (const p of properties) {
      const occ = occupiedByPropertyId.get(p.id) ?? 0;
      const declared =
        typeof p.unitCount === 'number' && Number.isFinite(p.unitCount)
          ? Math.max(0, Math.floor(p.unitCount))
          : null;
      // Until unit counts are set, capacity tracks assigned tenants (vacant stays 0).
      const capacity = declared === null ? occ : Math.max(declared, occ);
      total += capacity;
    }

    const vacant = Math.max(0, total - occupied);
    const pct = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0;

    return {
      occupied,
      total,
      vacant,
      notice,
      pct,
      propertyCount,
      tenantCount: occupied,
    };
  }

  async getPortfolioSummary(managerUserId: string): Promise<ManagerPortfolioSummary> {
    const user = await this.assertPropertyManager(managerUserId);
    const properties = await this.propertyRepository.find({
      where: { managerUserId },
      order: { name: 'ASC' },
    });
    const occupancy = await this.computeOccupancy(managerUserId, properties);
    return {
      accountName: user.fullName,
      propertyCount: properties.length,
      occupancy,
    };
  }

  async listPropertiesForManager(
    managerUserId: string,
  ): Promise<ManagerPropertyDetail[]> {
    await this.assertPropertyManager(managerUserId);
    const rows = await this.propertyRepository.find({
      where: { managerUserId },
      order: { name: 'ASC' },
    });
    return rows.map((r) => this.mapProperty(r));
  }

  async createProperty(
    managerUserId: string,
    dto: CreatePropertyDto,
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    const unitCount =
      dto.unitCount !== undefined && Number.isFinite(dto.unitCount)
        ? Math.max(1, Math.floor(dto.unitCount))
        : null;
    const row = this.propertyRepository.create({
      managerUserId,
      name: dto.name.trim(),
      addressLine: emptyToNull(dto.addressLine),
      city: emptyToNull(dto.city),
      stateRegion: emptyToNull(dto.stateRegion),
      postalCode: emptyToNull(dto.postalCode),
      country: emptyToNull(dto.country),
      unitCount,
    });
    try {
      const saved = await this.propertyRepository.save(row);
      return this.mapProperty(saved);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        if (code === '23505') {
          throw new ConflictException(
            'A property with this name already exists in your portfolio (case-insensitive).',
          );
        }
        this.logger.warn(`createProperty DB error [${code ?? 'unknown'}]: ${err.message}`);
      }
      this.logger.error(
        'createProperty failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not create property.');
    }
  }

  async updateProperty(
    managerUserId: string,
    propertyId: string,
    dto: UpdatePropertyDto,
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    const row = await this.propertyRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (!row) {
      throw new NotFoundException('Property not found');
    }
    const hasAny =
      dto.name !== undefined ||
      dto.addressLine !== undefined ||
      dto.city !== undefined ||
      dto.stateRegion !== undefined ||
      dto.postalCode !== undefined ||
      dto.country !== undefined ||
      dto.collectionBankName !== undefined ||
      dto.collectionAccountName !== undefined ||
      dto.collectionAccountNumber !== undefined ||
      dto.collectionPaymentInstructions !== undefined ||
      dto.unitCount !== undefined;
    if (!hasAny) {
      throw new BadRequestException('No updates provided');
    }
    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.addressLine !== undefined) {
      row.addressLine = emptyToNull(dto.addressLine);
    }
    if (dto.city !== undefined) {
      row.city = emptyToNull(dto.city);
    }
    if (dto.stateRegion !== undefined) {
      row.stateRegion = emptyToNull(dto.stateRegion);
    }
    if (dto.postalCode !== undefined) {
      row.postalCode = emptyToNull(dto.postalCode);
    }
    if (dto.country !== undefined) {
      row.country = emptyToNull(dto.country);
    }
    if (dto.collectionBankName !== undefined) {
      row.collectionBankName = emptyToNull(dto.collectionBankName);
    }
    if (dto.collectionAccountName !== undefined) {
      row.collectionAccountName = emptyToNull(dto.collectionAccountName);
    }
    if (dto.collectionAccountNumber !== undefined) {
      row.collectionAccountNumber = emptyToNull(dto.collectionAccountNumber);
    }
    if (dto.collectionPaymentInstructions !== undefined) {
      row.collectionPaymentInstructions = emptyToNull(dto.collectionPaymentInstructions);
    }
    if (dto.unitCount !== undefined) {
      if (dto.unitCount === null) {
        row.unitCount = null;
      } else if (Number.isFinite(dto.unitCount)) {
        row.unitCount = Math.max(1, Math.floor(dto.unitCount));
      }
    }
    try {
      const saved = await this.propertyRepository.save(row);
      return this.mapProperty(saved);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        if (code === '23505') {
          throw new ConflictException(
            'A property with this name already exists in your portfolio (case-insensitive).',
          );
        }
        this.logger.warn(`updateProperty DB error [${code ?? 'unknown'}]: ${err.message}`);
      }
      this.logger.error(
        'updateProperty failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not update property.');
    }
  }

  async deleteProperty(managerUserId: string, propertyId: string): Promise<void> {
    await this.assertPropertyManager(managerUserId);
    const res = await this.propertyRepository.delete({
      id: propertyId,
      managerUserId,
    });
    if (!res.affected) {
      throw new NotFoundException('Property not found');
    }
  }
}
