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
import type { PutServiceChargesDto } from './dto/put-service-charges.dto';
import { ServiceChargeLine } from './service-charge-line.entity';

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
    await this.assertPropertyOwnedByManager(managerUserId, propertyId);
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

    return this.listForProperty(managerUserId, propertyId);
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
  }> {
    const prop = await this.findPropertyForTenant(tenantId);
    if (!prop) {
      return { propertyName: null, lines: [] };
    }
    try {
      const rows = await this.lineRepository.find({
        where: { propertyId: prop.id },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      return {
        propertyName: prop.name,
        lines: rows.map((r) => this.mapLine(r)),
      };
    } catch (error) {
      this.rethrowIfMissingServiceChargeTable(error);
      throw error;
    }
  }
}
