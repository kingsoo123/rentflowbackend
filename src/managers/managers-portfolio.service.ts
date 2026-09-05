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
import { PropertyDocument } from '../properties/property-document.entity';
import { PropertyManagerAssignment } from '../properties/property-manager-assignment.entity';
import {
  PROPERTY_AMENITIES,
  PROPERTY_DOCUMENT_TYPES,
  PROPERTY_TYPES,
} from '../properties/property-catalog';
import { PropertyUnit } from '../properties/property-unit.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { PropertyManagerSubscriptionService } from '../auth/property-manager-subscription.service';

export type ManagerPropertyBuilding = {
  name: string;
  floors: number | null;
  unitCount: number | null;
};

export type ManagerPropertyDocument = {
  id: string;
  name: string;
  documentType: string;
  url: string;
  createdAt: string;
};

export type ManagerPropertyAssignee = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
};

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
  propertyType: string | null;
  amenities: string[];
  imageUrls: string[];
  buildings: ManagerPropertyBuilding[];
  documents: ManagerPropertyDocument[];
  assignedManagers: ManagerPropertyAssignee[];
  isPrimaryOwner: boolean;
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
    @InjectRepository(PropertyUnit)
    private readonly unitRepository: Repository<PropertyUnit>,
    @InjectRepository(PropertyDocument)
    private readonly documentRepository: Repository<PropertyDocument>,
    @InjectRepository(PropertyManagerAssignment)
    private readonly assignmentRepository: Repository<PropertyManagerAssignment>,
    private readonly subscriptionService: PropertyManagerSubscriptionService,
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

  private normalizeBuildings(
    raw: Property['buildings'] | null | undefined,
  ): ManagerPropertyBuilding[] {
    if (!Array.isArray(raw)) return [];
    const out: ManagerPropertyBuilding[] = [];
    for (const b of raw) {
      if (!b || typeof b !== 'object') continue;
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) continue;
      const floors =
        typeof b.floors === 'number' && Number.isFinite(b.floors)
          ? Math.max(0, Math.floor(b.floors))
          : null;
      const unitCount =
        typeof b.unitCount === 'number' && Number.isFinite(b.unitCount)
          ? Math.max(0, Math.floor(b.unitCount))
          : null;
      out.push({ name, floors, unitCount });
    }
    return out;
  }

  private normalizeAmenities(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const allowed = new Set<string>(PROPERTY_AMENITIES);
    const out: string[] = [];
    for (const a of raw) {
      if (typeof a !== 'string') continue;
      const t = a.trim();
      if (allowed.has(t) && !out.includes(t)) out.push(t);
    }
    return out;
  }

  private normalizeImageUrls(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const u of raw) {
      if (typeof u !== 'string') continue;
      const t = u.trim();
      if (t && !out.includes(t)) out.push(t);
    }
    return out.slice(0, 30);
  }

  private mapPropertyBase(
    p: Property,
    extras?: {
      documents?: ManagerPropertyDocument[];
      assignedManagers?: ManagerPropertyAssignee[];
      viewerUserId?: string;
    },
  ): ManagerPropertyDetail {
    const propertyType =
      typeof p.propertyType === 'string' &&
      (PROPERTY_TYPES as readonly string[]).includes(p.propertyType)
        ? p.propertyType
        : p.propertyType?.trim() || null;
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
      propertyType,
      amenities: this.normalizeAmenities(p.amenities),
      imageUrls: this.normalizeImageUrls(p.imageUrls),
      buildings: this.normalizeBuildings(p.buildings),
      documents: extras?.documents ?? [],
      assignedManagers: extras?.assignedManagers ?? [],
      isPrimaryOwner:
        extras?.viewerUserId !== undefined
          ? p.managerUserId === extras.viewerUserId
          : true,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private async enrichProperties(
    rows: Property[],
    viewerUserId: string,
  ): Promise<ManagerPropertyDetail[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const docs = await this.documentRepository
      .createQueryBuilder('d')
      .where('d.propertyId IN (:...ids)', { ids })
      .orderBy('d.createdAt', 'DESC')
      .getMany();
    const assigns = await this.assignmentRepository
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.manager', 'm')
      .where('a.propertyId IN (:...ids)', { ids })
      .orderBy('m.fullName', 'ASC')
      .getMany();

    const docsByProp = new Map<string, ManagerPropertyDocument[]>();
    for (const d of docs) {
      const list = docsByProp.get(d.propertyId) ?? [];
      list.push({
        id: d.id,
        name: d.name,
        documentType: d.documentType,
        url: d.url,
        createdAt: d.createdAt.toISOString(),
      });
      docsByProp.set(d.propertyId, list);
    }
    const assignsByProp = new Map<string, ManagerPropertyAssignee[]>();
    for (const a of assigns) {
      const list = assignsByProp.get(a.propertyId) ?? [];
      list.push({
        id: a.id,
        userId: a.managerUserId,
        email: a.manager?.email ?? '',
        fullName: a.manager?.fullName ?? '',
      });
      assignsByProp.set(a.propertyId, list);
    }

    return rows.map((r) =>
      this.mapPropertyBase(r, {
        documents: docsByProp.get(r.id) ?? [],
        assignedManagers: assignsByProp.get(r.id) ?? [],
        viewerUserId,
      }),
    );
  }

  private async assertCanAccessProperty(
    managerUserId: string,
    propertyId: string,
  ): Promise<Property> {
    const owned = await this.propertyRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (owned) return owned;
    const assignment = await this.assignmentRepository.findOne({
      where: { propertyId, managerUserId },
    });
    if (!assignment) {
      throw new NotFoundException('Property not found');
    }
    const prop = await this.propertyRepository.findOne({ where: { id: propertyId } });
    if (!prop) {
      throw new NotFoundException('Property not found');
    }
    return prop;
  }

  private async assertPrimaryOwner(
    managerUserId: string,
    propertyId: string,
  ): Promise<Property> {
    const row = await this.propertyRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (!row) {
      throw new NotFoundException('Property not found');
    }
    return row;
  }

  private sanitizeBuildingsInput(
    raw: Array<{ name: string; floors?: number | null; unitCount?: number | null }> | undefined,
  ): Property['buildings'] | undefined {
    if (raw === undefined) return undefined;
    return this.normalizeBuildings(raw);
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
    const unitsByPropertyId = new Map<string, number>();
    if (properties.length > 0) {
      const unitCounts = await this.unitRepository
        .createQueryBuilder('u')
        .select('u.propertyId', 'propertyId')
        .addSelect('COUNT(*)', 'cnt')
        .where('u.propertyId IN (:...ids)', { ids: properties.map((p) => p.id) })
        .groupBy('u.propertyId')
        .getRawMany<{ propertyId: string; cnt: string }>();
      for (const row of unitCounts) {
        unitsByPropertyId.set(row.propertyId, Number.parseInt(row.cnt, 10) || 0);
      }
    }

    for (const p of properties) {
      const occ = occupiedByPropertyId.get(p.id) ?? 0;
      const unitRows = unitsByPropertyId.get(p.id) ?? 0;
      const declared =
        typeof p.unitCount === 'number' && Number.isFinite(p.unitCount)
          ? Math.max(0, Math.floor(p.unitCount))
          : null;

      // Capacity priority:
      // 1) explicit unit_count on the property (e.g. 20 rentable units)
      // 2) else first-class unit catalog size
      // 3) else occupied only (vacant stays 0 until capacity is known)
      // Always at least `occ` so over-assignment never yields negative vacant.
      if (declared !== null) {
        total += Math.max(declared, unitRows, occ);
      } else if (unitRows > 0) {
        total += Math.max(unitRows, occ);
      } else {
        total += occ;
      }
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
    const owned = await this.propertyRepository.find({
      where: { managerUserId },
      order: { name: 'ASC' },
    });
    const assignedLinks = await this.assignmentRepository.find({
      where: { managerUserId },
    });
    const assignedIds = assignedLinks.map((a) => a.propertyId);
    let assigned: Property[] = [];
    if (assignedIds.length > 0) {
      assigned = await this.propertyRepository
        .createQueryBuilder('p')
        .where('p.id IN (:...ids)', { ids: assignedIds })
        .andWhere('p.managerUserId != :mid', { mid: managerUserId })
        .orderBy('p.name', 'ASC')
        .getMany();
    }
    const byId = new Map<string, Property>();
    for (const r of [...owned, ...assigned]) byId.set(r.id, r);
    const rows = [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    return this.enrichProperties(rows, managerUserId);
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
    const amenities = this.normalizeAmenities(dto.amenities);
    const imageUrls = this.normalizeImageUrls(dto.imageUrls);
    const buildings = this.sanitizeBuildingsInput(dto.buildings) ?? [];
    const propertyType =
      dto.propertyType && (PROPERTY_TYPES as readonly string[]).includes(dto.propertyType)
        ? dto.propertyType
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
      propertyType,
      amenities,
      imageUrls,
      buildings,
    });
    try {
      const saved = await this.propertyRepository.save(row);
      const [detail] = await this.enrichProperties([saved], managerUserId);
      return detail;
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
    const row = await this.assertCanAccessProperty(managerUserId, propertyId);
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
      dto.unitCount !== undefined ||
      dto.propertyType !== undefined ||
      dto.amenities !== undefined ||
      dto.imageUrls !== undefined ||
      dto.buildings !== undefined;
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
    if (dto.propertyType !== undefined) {
      if (dto.propertyType === null || !String(dto.propertyType).trim()) {
        row.propertyType = null;
      } else if ((PROPERTY_TYPES as readonly string[]).includes(dto.propertyType)) {
        row.propertyType = dto.propertyType;
      } else {
        throw new BadRequestException('Invalid property type');
      }
    }
    if (dto.amenities !== undefined) {
      row.amenities = this.normalizeAmenities(dto.amenities);
    }
    if (dto.imageUrls !== undefined) {
      row.imageUrls = this.normalizeImageUrls(dto.imageUrls);
    }
    if (dto.buildings !== undefined) {
      row.buildings = this.sanitizeBuildingsInput(dto.buildings) ?? [];
    }
    try {
      const saved = await this.propertyRepository.save(row);
      const [detail] = await this.enrichProperties([saved], managerUserId);
      return detail;
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

  async addPropertyDocument(
    managerUserId: string,
    propertyId: string,
    dto: { name: string; documentType: string; url: string },
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    await this.assertCanAccessProperty(managerUserId, propertyId);
    if (!(PROPERTY_DOCUMENT_TYPES as readonly string[]).includes(dto.documentType)) {
      throw new BadRequestException('Invalid document type');
    }
    const doc = this.documentRepository.create({
      propertyId,
      name: dto.name.trim(),
      documentType: dto.documentType,
      url: dto.url.trim(),
    });
    await this.documentRepository.save(doc);
    const prop = await this.propertyRepository.findOneOrFail({ where: { id: propertyId } });
    const [detail] = await this.enrichProperties([prop], managerUserId);
    return detail;
  }

  async removePropertyDocument(
    managerUserId: string,
    propertyId: string,
    documentId: string,
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    await this.assertCanAccessProperty(managerUserId, propertyId);
    const res = await this.documentRepository.delete({ id: documentId, propertyId });
    if (!res.affected) {
      throw new NotFoundException('Document not found');
    }
    const prop = await this.propertyRepository.findOneOrFail({ where: { id: propertyId } });
    const [detail] = await this.enrichProperties([prop], managerUserId);
    return detail;
  }

  async assignManager(
    managerUserId: string,
    propertyId: string,
    email: string,
  ): Promise<ManagerPropertyDetail> {
    const owner = await this.assertPropertyManager(managerUserId);
    await this.subscriptionService.assertHasFeature(
      owner.email,
      managerUserId,
      'multi_manager',
    );
    await this.assertPrimaryOwner(managerUserId, propertyId);
    const normalized = email.trim().toLowerCase();
    const assignee = await this.usersRepository.findOne({
      where: { email: normalized, role: UserRole.PROPERTY_MANAGER },
    });
    if (!assignee) {
      throw new NotFoundException(
        'No property manager account found with that email. They must sign up first.',
      );
    }
    if (assignee.id === managerUserId) {
      throw new BadRequestException('You are already the primary owner of this property.');
    }
    const existing = await this.assignmentRepository.findOne({
      where: { propertyId, managerUserId: assignee.id },
    });
    if (existing) {
      throw new ConflictException('That manager is already assigned to this property.');
    }
    await this.assignmentRepository.save(
      this.assignmentRepository.create({
        propertyId,
        managerUserId: assignee.id,
      }),
    );
    const prop = await this.propertyRepository.findOneOrFail({ where: { id: propertyId } });
    const [detail] = await this.enrichProperties([prop], managerUserId);
    return detail;
  }

  async unassignManager(
    managerUserId: string,
    propertyId: string,
    assignmentId: string,
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    await this.assertPrimaryOwner(managerUserId, propertyId);
    const res = await this.assignmentRepository.delete({ id: assignmentId, propertyId });
    if (!res.affected) {
      throw new NotFoundException('Assignment not found');
    }
    const prop = await this.propertyRepository.findOneOrFail({ where: { id: propertyId } });
    const [detail] = await this.enrichProperties([prop], managerUserId);
    return detail;
  }
}
