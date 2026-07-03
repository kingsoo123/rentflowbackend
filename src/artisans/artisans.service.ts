import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { MaintenanceRequestStatus } from '../maintenance/maintenance-request-status.enum';
import { ManagerArtisanRoster } from '../managers/manager-artisan-roster.entity';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

export type ArtisanRosterEntry = {
  managerUserId: string;
  managerName: string;
  managerEmail: string;
  linkedAt: string;
  tradeType: string | null;
  companyName: string | null;
  phone: string | null;
  propertiesAssigned: string | null;
  serviceAreaNotes: string | null;
  availabilityNotes: string | null;
  hourlyRateDisplay: string | null;
  licenseNumber: string | null;
  notes: string | null;
};

export type ArtisanProfileSummary = {
  fullName: string;
  email: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  managerCount: number;
  propertyNames: string[];
  tradeType: string | null;
  rosters: ArtisanRosterEntry[];
};

export type ArtisanMaintenanceRequestRow = {
  id: string;
  title: string;
  description: string;
  urgency: string;
  status: string;
  attachmentUrls: string[];
  createdAt: Date;
  updatedAt: Date;
  tenantFullName: string;
  propertyAssigned: string | null;
  managerName: string;
};

function strFromProfile(profile: unknown, key: string): string | null {
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

function parsePropertiesAssigned(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ACTIVE_MAINTENANCE_STATUSES = new Set<string>([
  MaintenanceRequestStatus.SUBMITTED,
  MaintenanceRequestStatus.REVIEWING,
  MaintenanceRequestStatus.IN_PROGRESS,
]);

@Injectable()
export class ArtisansService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ManagerArtisanRoster)
    private readonly rosterRepository: Repository<ManagerArtisanRoster>,
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
  ) {}

  async getProfile(artisanUserId: string): Promise<ArtisanProfileSummary> {
    const user = await this.usersRepository.findOne({ where: { id: artisanUserId } });
    if (!user) {
      return {
        fullName: 'Worker',
        email: '',
        phoneCountryCode: null,
        phoneNumber: null,
        managerCount: 0,
        propertyNames: [],
        tradeType: null,
        rosters: [],
      };
    }

    const rosterRows = await this.rosterRepository.find({
      where: { artisanUserId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const managerIds = [...new Set(rosterRows.map((r) => r.managerUserId))];
    const managers =
      managerIds.length > 0
        ? await this.usersRepository.find({ where: { id: In(managerIds) } })
        : [];
    const managerById = new Map(managers.map((m) => [m.id, m]));

    const propertyNameSet = new Set<string>();
    let tradeType: string | null = null;

    const rosters: ArtisanRosterEntry[] = rosterRows.map((row) => {
      const profile = row.profileData;
      const assigned = strFromProfile(profile, 'propertiesAssigned');
      for (const name of parsePropertiesAssigned(assigned)) {
        propertyNameSet.add(name);
      }
      const rowTrade = strFromProfile(profile, 'tradeType');
      if (!tradeType && rowTrade) {
        tradeType = rowTrade;
      }
      const manager = managerById.get(row.managerUserId);
      return {
        managerUserId: row.managerUserId,
        managerName: manager?.fullName ?? 'Property manager',
        managerEmail: manager?.email ?? '',
        linkedAt: row.createdAt.toISOString(),
        tradeType: rowTrade,
        companyName: strFromProfile(profile, 'companyName'),
        phone: strFromProfile(profile, 'phone'),
        propertiesAssigned: assigned,
        serviceAreaNotes: strFromProfile(profile, 'serviceAreaNotes'),
        availabilityNotes: strFromProfile(profile, 'availabilityNotes'),
        hourlyRateDisplay: strFromProfile(profile, 'hourlyRateDisplay'),
        licenseNumber: strFromProfile(profile, 'licenseNumber'),
        notes: strFromProfile(profile, 'notes'),
      };
    });

    return {
      fullName: user.fullName,
      email: user.email,
      phoneCountryCode: user.phoneCountryCode,
      phoneNumber: user.phoneNumber,
      managerCount: rosters.length,
      propertyNames: [...propertyNameSet],
      tradeType,
      rosters,
    };
  }

  async listMaintenanceRequests(
    artisanUserId: string,
  ): Promise<ArtisanMaintenanceRequestRow[]> {
    const rosterRows = await this.rosterRepository.find({
      where: { artisanUserId },
      order: { createdAt: 'DESC' },
    });
    if (rosterRows.length === 0) {
      return [];
    }

    const managerIds = [...new Set(rosterRows.map((r) => r.managerUserId))];
    const managers = await this.usersRepository.find({ where: { id: In(managerIds) } });
    const managerById = new Map(managers.map((m) => [m.id, m]));

    const seen = new Set<string>();
    const out: ArtisanMaintenanceRequestRow[] = [];

    for (const roster of rosterRows) {
      const propertyNames = parsePropertiesAssigned(
        strFromProfile(roster.profileData, 'propertiesAssigned'),
      );
      if (propertyNames.length === 0) {
        continue;
      }
      const normalizedNames = propertyNames.map((n) => n.trim().toLowerCase());
      const rows = await this.maintenanceRepository
        .createQueryBuilder('mr')
        .innerJoin(User, 'u', 'u.id = mr.tenantId AND u.role = :role', {
          role: UserRole.TENANT,
        })
        .leftJoin(TenantProfile, 'tp', 'tp.userId = u.id')
        .innerJoin(
          Property,
          'p',
          `p.managerUserId = :managerUserId AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))`,
          { managerUserId: roster.managerUserId },
        )
        .andWhere(
          `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) IN (:...names)`,
          { names: normalizedNames },
        )
        .orderBy('mr.createdAt', 'DESC')
        .take(100)
        .getMany();

      if (rows.length === 0) {
        continue;
      }

      const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
      const tenants = await this.usersRepository.find({ where: { id: In(tenantIds) } });
      const tenantById = new Map(tenants.map((u) => [u.id, u]));

      const profiles = await this.tenantProfileRepository.find({
        where: { userId: In(tenantIds) },
      });
      const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

      const manager = managerById.get(roster.managerUserId);
      const managerName = manager?.fullName ?? 'Property manager';

      for (const row of rows) {
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        const tenant = tenantById.get(row.tenantId);
        const tp = profileByUserId.get(row.tenantId);
        out.push({
          id: row.id,
          title: row.title,
          description: row.description,
          urgency: row.urgency,
          status: row.status,
          attachmentUrls: Array.isArray(row.attachmentUrls) ? row.attachmentUrls : [],
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          tenantFullName: tenant?.fullName ?? 'Tenant',
          propertyAssigned: strFromProfile(tp?.profileData, 'propertyAssigned'),
          managerName,
        });
      }
    }

    return out
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100);
  }

  /** Active maintenance count for dashboard summary cards. */
  async countActiveMaintenance(artisanUserId: string): Promise<number> {
    const rows = await this.listMaintenanceRequests(artisanUserId);
    return rows.filter((r) => ACTIVE_MAINTENANCE_STATUSES.has(r.status)).length;
  }
}
