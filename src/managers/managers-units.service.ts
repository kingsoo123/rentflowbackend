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
import { Property } from '../properties/property.entity';
import { PropertyUnit } from '../properties/property-unit.entity';
import {
  isPropertyUnitStatus,
  PropertyUnitStatus,
} from '../properties/property-unit-status.enum';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import type { CreatePropertyUnitDto } from './dto/create-property-unit.dto';
import type { UpdatePropertyUnitDto } from './dto/update-property-unit.dto';

export type ManagerPropertyUnitDetail = {
  id: string;
  propertyId: string;
  label: string;
  notes: string | null;
  /** Operational availability (available / reserved / under_maintenance / unavailable). */
  status: PropertyUnitStatus;
  occupied: boolean;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: string;
  updatedAt: string;
};

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

function emptyToNull(s: string | undefined | null): string | null {
  if (s === undefined || s === null) {
    return null;
  }
  const t = String(s).trim();
  return t === '' ? null : t;
}

@Injectable()
export class ManagersUnitsService {
  private readonly logger = new Logger(ManagersUnitsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(PropertyUnit)
    private readonly unitRepository: Repository<PropertyUnit>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
  ) {}

  private async assertManager(managerUserId: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: managerUserId, role: UserRole.PROPERTY_MANAGER },
    });
    if (!user) {
      throw new NotFoundException('Manager not found');
    }
  }

  private async assertOwnedProperty(
    managerUserId: string,
    propertyId: string,
  ): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }

  private async occupancyByUnitId(
    property: Property,
    unitIds: string[],
  ): Promise<Map<string, { tenantId: string; tenantName: string }>> {
    const map = new Map<string, { tenantId: string; tenantName: string }>();
    if (unitIds.length === 0) {
      return map;
    }
    const propName = property.name.trim().toLowerCase();
    const rows = await this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .select('u.id', 'tenantId')
      .addSelect('u.fullName', 'tenantName')
      .addSelect(`tp.profile_data->>'unitId'`, 'unitId')
      .where('u.role = :role', { role: UserRole.TENANT })
      .andWhere(`LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = :propName`, {
        propName,
      })
      .andWhere(`tp.profile_data->>'unitId' IN (:...unitIds)`, { unitIds })
      .getRawMany<{ tenantId: string; tenantName: string; unitId: string }>();

    for (const row of rows) {
      const uid = typeof row.unitId === 'string' ? row.unitId.trim() : '';
      if (!uid || map.has(uid)) {
        continue;
      }
      map.set(uid, {
        tenantId: row.tenantId,
        tenantName: row.tenantName?.trim() || 'Tenant',
      });
    }
    return map;
  }

  private normalizeStatus(raw: unknown): PropertyUnitStatus {
    if (isPropertyUnitStatus(raw)) {
      return raw;
    }
    return PropertyUnitStatus.AVAILABLE;
  }

  private mapUnit(
    u: PropertyUnit,
    occ: { tenantId: string; tenantName: string } | undefined,
  ): ManagerPropertyUnitDetail {
    return {
      id: u.id,
      propertyId: u.propertyId,
      label: u.label,
      notes: u.notes,
      status: this.normalizeStatus(u.status),
      occupied: Boolean(occ),
      tenantId: occ?.tenantId ?? null,
      tenantName: occ?.tenantName ?? null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }

  async listUnitsForProperty(
    managerUserId: string,
    propertyId: string,
  ): Promise<ManagerPropertyUnitDetail[]> {
    await this.assertManager(managerUserId);
    const property = await this.assertOwnedProperty(managerUserId, propertyId);
    const rows = await this.unitRepository.find({
      where: { propertyId },
      order: { label: 'ASC' },
    });
    const occ = await this.occupancyByUnitId(
      property,
      rows.map((r) => r.id),
    );
    return rows.map((r) => this.mapUnit(r, occ.get(r.id)));
  }

  async createUnit(
    managerUserId: string,
    propertyId: string,
    dto: CreatePropertyUnitDto,
  ): Promise<ManagerPropertyUnitDetail> {
    await this.assertManager(managerUserId);
    await this.assertOwnedProperty(managerUserId, propertyId);
    const label = dto.label.trim();
    const row = this.unitRepository.create({
      propertyId,
      label,
      status: this.normalizeStatus(dto.status ?? PropertyUnitStatus.AVAILABLE),
      notes: emptyToNull(dto.notes),
    });
    try {
      const saved = await this.unitRepository.save(row);
      return this.mapUnit(saved, undefined);
    } catch (err) {
      if (err instanceof QueryFailedError && pgErrorCode(err) === '23505') {
        throw new ConflictException(
          'A unit with this label already exists on this property (case-insensitive).',
        );
      }
      this.logger.error(
        'createUnit failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not create unit.');
    }
  }

  async updateUnit(
    managerUserId: string,
    propertyId: string,
    unitId: string,
    dto: UpdatePropertyUnitDto,
  ): Promise<ManagerPropertyUnitDetail> {
    await this.assertManager(managerUserId);
    const property = await this.assertOwnedProperty(managerUserId, propertyId);
    const row = await this.unitRepository.findOne({
      where: { id: unitId, propertyId },
    });
    if (!row) {
      throw new NotFoundException('Unit not found');
    }
    if (
      dto.label === undefined &&
      dto.notes === undefined &&
      dto.status === undefined
    ) {
      throw new BadRequestException('No updates provided');
    }
    const prevLabel = row.label;
    if (dto.label !== undefined) {
      row.label = dto.label.trim();
    }
    if (dto.status !== undefined) {
      row.status = this.normalizeStatus(dto.status);
    }
    if (dto.notes !== undefined) {
      row.notes = dto.notes === null ? null : emptyToNull(dto.notes);
    }
    try {
      const saved = await this.unitRepository.save(row);
      if (dto.label !== undefined && saved.label !== prevLabel) {
        await this.syncTenantUnitNumbers(saved.id, saved.label);
      }
      const occ = await this.occupancyByUnitId(property, [saved.id]);
      return this.mapUnit(saved, occ.get(saved.id));
    } catch (err) {
      if (err instanceof QueryFailedError && pgErrorCode(err) === '23505') {
        throw new ConflictException(
          'A unit with this label already exists on this property (case-insensitive).',
        );
      }
      this.logger.error(
        'updateUnit failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not update unit.');
    }
  }

  async deleteUnit(
    managerUserId: string,
    propertyId: string,
    unitId: string,
  ): Promise<void> {
    await this.assertManager(managerUserId);
    await this.assertOwnedProperty(managerUserId, propertyId);
    const row = await this.unitRepository.findOne({
      where: { id: unitId, propertyId },
    });
    if (!row) {
      throw new NotFoundException('Unit not found');
    }
    await this.clearTenantUnitId(unitId);
    await this.unitRepository.delete({ id: unitId, propertyId });
  }

  /**
   * Resolve unitId + unitNumber for a tenant profile against a managed property.
   * - If unitId set: must belong to property; sync label → unitNumber; enforce one tenant.
   * - Else if unitNumber set: find or create unit on that property and set unitId.
   */
  async resolveTenantUnitAssignment(params: {
    managerUserId: string;
    propertyName: string;
    profile: Record<string, unknown>;
    excludeTenantUserId?: string;
  }): Promise<Record<string, unknown>> {
    const { managerUserId, propertyName, excludeTenantUserId } = params;
    const profile = { ...params.profile };
    const property = await this.propertyRepository
      .createQueryBuilder('p')
      .where('p.managerUserId = :mid', { mid: managerUserId })
      .andWhere('LOWER(TRIM(p.name)) = :n', {
        n: propertyName.trim().toLowerCase(),
      })
      .getOne();
    if (!property) {
      throw new BadRequestException(
        'propertyAssigned must match a property name in your portfolio.',
      );
    }

    const rawUnitId =
      typeof profile.unitId === 'string' ? profile.unitId.trim() : '';
    const rawUnitNumber =
      typeof profile.unitNumber === 'string' ? profile.unitNumber.trim() : '';

    if (!rawUnitId && !rawUnitNumber) {
      delete profile.unitId;
      delete profile.unitNumber;
      return profile;
    }

    let unit: PropertyUnit | null = null;
    if (rawUnitId) {
      unit = await this.unitRepository.findOne({
        where: { id: rawUnitId, propertyId: property.id },
      });
      if (!unit) {
        throw new BadRequestException(
          'unitId must refer to a unit on the assigned property.',
        );
      }
    } else if (rawUnitNumber) {
      unit = await this.unitRepository
        .createQueryBuilder('u')
        .where('u.propertyId = :pid', { pid: property.id })
        .andWhere('LOWER(TRIM(u.label)) = :label', {
          label: rawUnitNumber.toLowerCase(),
        })
        .getOne();
      if (!unit) {
        try {
          unit = await this.unitRepository.save(
            this.unitRepository.create({
              propertyId: property.id,
              label: rawUnitNumber,
              status: PropertyUnitStatus.AVAILABLE,
              notes: null,
            }),
          );
        } catch (err) {
          if (err instanceof QueryFailedError && pgErrorCode(err) === '23505') {
            unit = await this.unitRepository
              .createQueryBuilder('u')
              .where('u.propertyId = :pid', { pid: property.id })
              .andWhere('LOWER(TRIM(u.label)) = :label', {
                label: rawUnitNumber.toLowerCase(),
              })
              .getOne();
          } else {
            throw err;
          }
        }
        if (!unit) {
          throw new InternalServerErrorException('Could not create unit for tenant.');
        }
      }
    }

    if (!unit) {
      delete profile.unitId;
      delete profile.unitNumber;
      return profile;
    }

    const unitStatus = this.normalizeStatus(unit.status);
    if (
      unitStatus === PropertyUnitStatus.UNDER_MAINTENANCE ||
      unitStatus === PropertyUnitStatus.UNAVAILABLE
    ) {
      throw new BadRequestException(
        unitStatus === PropertyUnitStatus.UNDER_MAINTENANCE
          ? `Unit "${unit.label}" is under maintenance and cannot be assigned.`
          : `Unit "${unit.label}" is unavailable and cannot be assigned.`,
      );
    }

    await this.assertUnitNotOccupiedByOther(unit.id, excludeTenantUserId);

    profile.unitId = unit.id;
    profile.unitNumber = unit.label;
    return profile;
  }

  private async assertUnitNotOccupiedByOther(
    unitId: string,
    excludeTenantUserId?: string,
  ): Promise<void> {
    const qb = this.usersRepository
      .createQueryBuilder('u')
      .innerJoin(TenantProfile, 'tp', 'tp.userId = u.id')
      .where('u.role = :role', { role: UserRole.TENANT })
      .andWhere(`tp.profile_data->>'unitId' = :unitId`, { unitId });
    if (excludeTenantUserId) {
      qb.andWhere('u.id <> :exclude', { exclude: excludeTenantUserId });
    }
    const other = await qb.getOne();
    if (other) {
      throw new ConflictException(
        'That unit is already assigned to another tenant. Clear or reassign them first.',
      );
    }
  }

  private async syncTenantUnitNumbers(unitId: string, label: string): Promise<void> {
    const profiles = await this.tenantProfileRepository
      .createQueryBuilder('tp')
      .where(`tp.profile_data->>'unitId' = :unitId`, { unitId })
      .getMany();
    for (const tp of profiles) {
      const data =
        tp.profileData && typeof tp.profileData === 'object' && !Array.isArray(tp.profileData)
          ? { ...(tp.profileData as Record<string, unknown>) }
          : {};
      data.unitNumber = label;
      tp.profileData = data;
      await this.tenantProfileRepository.save(tp);
    }
  }

  private async clearTenantUnitId(unitId: string): Promise<void> {
    const profiles = await this.tenantProfileRepository
      .createQueryBuilder('tp')
      .where(`tp.profile_data->>'unitId' = :unitId`, { unitId })
      .getMany();
    for (const tp of profiles) {
      const data =
        tp.profileData && typeof tp.profileData === 'object' && !Array.isArray(tp.profileData)
          ? { ...(tp.profileData as Record<string, unknown>) }
          : {};
      delete data.unitId;
      // Keep unitNumber as historical label on the profile.
      tp.profileData = data;
      await this.tenantProfileRepository.save(tp);
    }
  }
}
