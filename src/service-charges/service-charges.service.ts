import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { TenantNotificationsRealtimeService } from '../tenant-notifications/tenant-notifications-realtime.service';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import { MaintenanceRealtimeService } from '../maintenance/maintenance-realtime.service';
import type { PutServiceChargesDto } from './dto/put-service-charges.dto';
import { ServiceChargeLine } from './service-charge-line.entity';
import { isServiceChargeAmountVisible } from './service-charge-publish';

export type ServiceChargeLineRow = {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
};

function parseAmount(raw: string | number): number {
  if (typeof raw === 'number') {
    return raw;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class ServiceChargesService {
  constructor(
    @InjectRepository(ServiceChargeLine)
    private readonly lineRepository: Repository<ServiceChargeLine>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly tenantNotificationsRealtime: TenantNotificationsRealtimeService,
    private readonly tenantNotifications: TenantNotificationsService,
    private readonly maintenanceRealtime: MaintenanceRealtimeService,
  ) {}

  private async assertPropertyOwnedByManager(
    managerUserId: string,
    propertyId: string,
  ): Promise<Property> {
    const p = await this.propertyRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (!p) {
      throw new NotFoundException('Property not found');
    }
    return p;
  }

  private mapLine(row: ServiceChargeLine): ServiceChargeLineRow {
    return {
      id: row.id,
      label: row.label,
      amount: parseAmount(row.amount as unknown as string),
      sortOrder: row.sortOrder,
    };
  }

  /** Postgres `undefined_table` — usually migration `CreateServiceChargeLines` not applied. */
  private rethrowIfMissingServiceChargeTable(error: unknown): void {
    if (!(error instanceof QueryFailedError)) {
      return;
    }
    const code = (error.driverError as { code?: string } | undefined)?.code;
    if (code === '42P01') {
      throw new ServiceUnavailableException(
        'Service charges require the service_charge_lines table. From real_estate_backend run: npm run typeorm:migration:run',
      );
    }
  }

  async listForProperty(
    managerUserId: string,
    propertyId: string,
  ): Promise<{ lines: ServiceChargeLineRow[] }> {
    await this.assertPropertyOwnedByManager(managerUserId, propertyId);
    try {
      const rows = await this.lineRepository.find({
        where: { propertyId },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      return { lines: rows.map((r) => this.mapLine(r)) };
    } catch (error) {
      this.rethrowIfMissingServiceChargeTable(error);
      throw error;
    }
  }

  async replaceForProperty(
    managerUserId: string,
    propertyId: string,
    dto: PutServiceChargesDto,
  ): Promise<{ lines: ServiceChargeLineRow[] }> {
    const property = await this.assertPropertyOwnedByManager(
      managerUserId,
      propertyId,
    );
    const lines = dto.lines ?? [];

    try {
      await this.lineRepository.manager.transaction(async (em) => {
        await em.delete(ServiceChargeLine, { propertyId });
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i];
          const label = raw.label.trim();
          const amount = Math.round(raw.amount * 100) / 100;
          const entity = em.create(ServiceChargeLine, {
            propertyId,
            label,
            amount: amount.toFixed(2),
            sortOrder: i,
          });
          await em.save(ServiceChargeLine, entity);
        }
      });
    } catch (error) {
      this.rethrowIfMissingServiceChargeTable(error);
      throw error;
    }

    const tenantIds = await this.listTenantIdsWhoSeeServiceChargesForProperty(
      propertyId,
    );
    if (tenantIds.length > 0) {
      await this.tenantNotifications.createServiceChargeNotificationsForTenants({
        tenantIds,
        propertyName: property.name,
      });
    }
    for (const tenantId of tenantIds) {
      this.tenantNotificationsRealtime.notifyServiceChargesUpdated(tenantId);
    }
    this.maintenanceRealtime.notifyRevenueUpdated(managerUserId);

    return this.listForProperty(managerUserId, propertyId);
  }

  /**
   * Tenant user IDs for whom `GET /api/tenants/service-charges` reads lines from this
   * property (same name match + oldest-property rule as `findPropertyForTenant`).
   */
  private async listTenantIdsWhoSeeServiceChargesForProperty(
    propertyId: string,
  ): Promise<string[]> {
    const rows = await this.propertyRepository.query<Array<{ id: string }>>(
      `
      SELECT u.id AS id
      FROM users u
      INNER JOIN tenant_profiles tp ON tp.user_id = u.id
      INNER JOIN properties canon ON canon.id = $1
      WHERE u.role = $2
        AND LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(canon.name))
        AND (
          SELECT p2.id FROM properties p2
          WHERE LOWER(TRIM(p2.name)) = LOWER(TRIM(canon.name))
          ORDER BY p2.created_at ASC
          LIMIT 1
        ) = canon.id
      `,
      [propertyId, UserRole.TENANT],
    );
    return rows.map((r) => r.id);
  }

  /**
   * Resolves the tenant's assigned property name to a single `properties` row
   * (oldest matching row if multiple managers used the same display name).
   */
  private async findPropertyForTenant(tenantId: string): Promise<Property | null> {
    const row = await this.propertyRepository
      .createQueryBuilder('p')
      .innerJoin(TenantProfile, 'tp', 'tp.user_id = :tenantId', { tenantId })
      .innerJoin(User, 'u', 'u.id = tp.user_id AND u.role = :role', {
        role: UserRole.TENANT,
      })
      .where(
        `LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))`,
      )
      .orderBy('p.created_at', 'ASC')
      .getOne();
    return row;
  }

  async listForTenant(tenantId: string): Promise<{
    propertyName: string | null;
    lines: ServiceChargeLineRow[];
    source: 'active' | 'paid_current_month' | 'before_publish_day';
  }> {
    const prop = await this.findPropertyForTenant(tenantId);
    if (!prop) {
      return { propertyName: null, lines: [], source: 'active' };
    }
    if (await this.tenantNotifications.hasConfirmedServiceChargeForCurrentMonth(tenantId)) {
      return {
        propertyName: prop.name,
        lines: [],
        source: 'paid_current_month',
      };
    }
    if (!isServiceChargeAmountVisible()) {
      return {
        propertyName: prop.name,
        lines: [],
        source: 'before_publish_day',
      };
    }
    try {
      const rows = await this.lineRepository.find({
        where: { propertyId: prop.id },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      return {
        propertyName: prop.name,
        lines: rows.map((r) => this.mapLine(r)),
        source: 'active',
      };
    } catch (error) {
      this.rethrowIfMissingServiceChargeTable(error);
      throw error;
    }
  }
}
