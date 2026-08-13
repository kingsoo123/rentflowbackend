import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { Property } from '../properties/property.entity';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import { User } from '../users/user.entity';
import { sanitizeUserText } from '../common/sanitize-user-text';
import { assertInspectionPhotoUrl } from '../uploads/upload-storage';
import type { InspectionChecklistItem } from './inspection-checklist';
import { InspectionItemCondition, InspectionOverallCondition } from './inspection-condition.enum';
import { InspectionRecord } from './inspection-record.entity';
import { InspectionStatus } from './inspection-status.enum';
import { InspectionType } from './inspection-type.enum';
import type {
  CompleteInspectionDto,
  CreateInspectionDto,
  InspectionChecklistItemDto,
  TenantSignInspectionDto,
  UpdateInspectionDto,
} from './dto/inspection.dto';

export type InspectionSummary = {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantEmail: string | null;
  type: InspectionType;
  status: InspectionStatus;
  unitLabel: string | null;
  inspectedAt: string;
  overallCondition: InspectionOverallCondition | null;
  photoCount: number;
  checklistItemCount: number;
  managerSignedAt: string | null;
  tenantSignedAt: string | null;
  tenantSignatureName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InspectionDetail = InspectionSummary & {
  notes: string | null;
  checklistItems: InspectionChecklistItem[];
  photoUrls: string[];
};

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(InspectionRecord)
    private readonly inspectionsRepository: Repository<InspectionRecord>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly tenantNotificationsService: TenantNotificationsService,
  ) {}

  async listForManager(managerUserId: string): Promise<InspectionSummary[]> {
    const rows = await this.inspectionsRepository.find({
      where: { managerUserId },
      order: { inspectedAt: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
    return this.toSummaries(rows);
  }

  async getForManager(managerUserId: string, id: string): Promise<InspectionDetail> {
    const row = await this.requireManagerInspection(managerUserId, id);
    const [summary] = await this.toSummaries([row]);
    return {
      ...summary,
      notes: row.notes,
      checklistItems: Array.isArray(row.checklistItems) ? row.checklistItems : [],
      photoUrls: Array.isArray(row.photoUrls) ? row.photoUrls : [],
    };
  }

  async createForManager(
    managerUserId: string,
    dto: CreateInspectionDto,
  ): Promise<InspectionDetail> {
    await this.assertPropertyOwned(managerUserId, dto.propertyId);
    if (dto.tenantId) {
      await this.managersTenantsService.assertTenantBelongsToManager(
        managerUserId,
        dto.tenantId,
      );
    }

    const checklist = this.normalizeChecklist(dto.checklistItems ?? []);
    const photoUrls = this.normalizePhotoUrls(dto.photoUrls ?? []);

    const requestSignoff = dto.requestTenantSignoff === true && !!dto.tenantId;
    const now = new Date();

    const row = this.inspectionsRepository.create({
      managerUserId,
      propertyId: dto.propertyId,
      tenantId: dto.tenantId ?? null,
      type: dto.type,
      status: requestSignoff
        ? InspectionStatus.AWAITING_TENANT_SIGNOFF
        : InspectionStatus.DRAFT,
      unitLabel: dto.unitLabel?.trim() ? sanitizeUserText(dto.unitLabel.trim()) : null,
      inspectedAt: dto.inspectedAt.slice(0, 10),
      notes: dto.notes?.trim() ? sanitizeUserText(dto.notes.trim()) : null,
      overallCondition: dto.overallCondition ?? null,
      checklistItems: checklist,
      photoUrls,
      managerSignedAt: requestSignoff ? now : null,
      tenantSignedAt: null,
      tenantSignatureName: null,
    });

    const saved = await this.inspectionsRepository.save(row);

    if (requestSignoff && saved.tenantId) {
      await this.notifyTenantOfInspection(saved);
    }

    return this.getForManager(managerUserId, saved.id);
  }

  async updateForManager(
    managerUserId: string,
    id: string,
    dto: UpdateInspectionDto,
  ): Promise<InspectionDetail> {
    const row = await this.requireManagerInspection(managerUserId, id);
    if (
      row.status === InspectionStatus.SIGNED ||
      row.status === InspectionStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'This inspection is finalized and can no longer be edited.',
      );
    }

    if (dto.tenantId !== undefined) {
      if (dto.tenantId === null) {
        row.tenantId = null;
      } else {
        await this.managersTenantsService.assertTenantBelongsToManager(
          managerUserId,
          dto.tenantId,
        );
        row.tenantId = dto.tenantId;
      }
    }
    if (dto.type !== undefined) {
      row.type = dto.type;
    }
    if (dto.unitLabel !== undefined) {
      row.unitLabel = dto.unitLabel?.trim()
        ? sanitizeUserText(dto.unitLabel.trim())
        : null;
    }
    if (dto.inspectedAt !== undefined) {
      row.inspectedAt = dto.inspectedAt.slice(0, 10);
    }
    if (dto.notes !== undefined) {
      row.notes = dto.notes?.trim() ? sanitizeUserText(dto.notes.trim()) : null;
    }
    if (dto.overallCondition !== undefined) {
      row.overallCondition = dto.overallCondition;
    }
    if (dto.checklistItems !== undefined) {
      row.checklistItems = this.normalizeChecklist(dto.checklistItems);
    }
    if (dto.photoUrls !== undefined) {
      row.photoUrls = this.normalizePhotoUrls(dto.photoUrls);
    }

    await this.inspectionsRepository.save(row);
    return this.getForManager(managerUserId, id);
  }

  async completeForManager(
    managerUserId: string,
    id: string,
    dto: CompleteInspectionDto,
  ): Promise<InspectionDetail> {
    const row = await this.requireManagerInspection(managerUserId, id);
    if (row.status === InspectionStatus.SIGNED) {
      throw new BadRequestException('This inspection is already signed.');
    }

    const requestSignoff = dto.requestTenantSignoff !== false && !!row.tenantId;
    row.managerSignedAt = new Date();

    if (requestSignoff) {
      row.status = InspectionStatus.AWAITING_TENANT_SIGNOFF;
      await this.inspectionsRepository.save(row);
      await this.notifyTenantOfInspection(row);
    } else {
      row.status = InspectionStatus.COMPLETED;
      await this.inspectionsRepository.save(row);
    }

    return this.getForManager(managerUserId, id);
  }

  async listForTenant(tenantId: string): Promise<InspectionSummary[]> {
    const rows = await this.inspectionsRepository.find({
      where: { tenantId },
      order: { inspectedAt: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
    const visible = rows.filter(
      (r) =>
        r.status === InspectionStatus.AWAITING_TENANT_SIGNOFF ||
        r.status === InspectionStatus.SIGNED ||
        r.status === InspectionStatus.COMPLETED,
    );
    return this.toSummaries(visible);
  }

  async getForTenant(tenantId: string, id: string): Promise<InspectionDetail> {
    const row = await this.inspectionsRepository.findOne({ where: { id, tenantId } });
    if (!row) {
      throw new NotFoundException('Inspection not found');
    }
    if (row.status === InspectionStatus.DRAFT) {
      throw new ForbiddenException('This inspection is not available yet');
    }
    const [summary] = await this.toSummaries([row]);
    return {
      ...summary,
      notes: row.notes,
      checklistItems: Array.isArray(row.checklistItems) ? row.checklistItems : [],
      photoUrls: Array.isArray(row.photoUrls) ? row.photoUrls : [],
    };
  }

  async signForTenant(
    tenantId: string,
    id: string,
    dto: TenantSignInspectionDto,
  ): Promise<InspectionDetail> {
    const row = await this.inspectionsRepository.findOne({ where: { id, tenantId } });
    if (!row) {
      throw new NotFoundException('Inspection not found');
    }
    if (row.status !== InspectionStatus.AWAITING_TENANT_SIGNOFF) {
      throw new BadRequestException(
        'This inspection is not awaiting your signature.',
      );
    }
    const name = sanitizeUserText(dto.signatureName.trim());
    if (!name) {
      throw new BadRequestException('Enter your full name to sign.');
    }
    row.tenantSignatureName = name.slice(0, 200);
    row.tenantSignedAt = new Date();
    row.status = InspectionStatus.SIGNED;
    await this.inspectionsRepository.save(row);
    return this.getForTenant(tenantId, id);
  }

  private async notifyTenantOfInspection(row: InspectionRecord): Promise<void> {
    if (!row.tenantId) {
      return;
    }
    const typeLabel = this.typeLabel(row.type);
    const headline = `${typeLabel} inspection ready for review`;
    const body =
      `Your property manager completed a ${typeLabel.toLowerCase()} inspection` +
      (row.unitLabel ? ` for ${row.unitLabel}` : '') +
      `. Open Inspections on your dashboard to review the checklist and sign if you agree.`;
    await this.tenantNotificationsService.createManagerTaskNotificationsForTenants({
      tenantIds: [row.tenantId],
      headline,
      body,
    });
  }

  private async requireManagerInspection(
    managerUserId: string,
    id: string,
  ): Promise<InspectionRecord> {
    const row = await this.inspectionsRepository.findOne({
      where: { id, managerUserId },
    });
    if (!row) {
      throw new NotFoundException('Inspection not found');
    }
    return row;
  }

  private async assertPropertyOwned(
    managerUserId: string,
    propertyId: string,
  ): Promise<Property> {
    const property = await this.propertiesRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (!property) {
      throw new NotFoundException('Property not found in your portfolio');
    }
    return property;
  }

  private normalizeChecklist(
    items: InspectionChecklistItemDto[] | InspectionChecklistItem[],
  ): InspectionChecklistItem[] {
    return items.slice(0, 80).map((item) => {
      const condition = Object.values(InspectionItemCondition).includes(
        item.condition as InspectionItemCondition,
      )
        ? (item.condition as InspectionItemCondition)
        : InspectionItemCondition.GOOD;
      return {
        id: item.id?.trim() || randomUUID(),
        area: sanitizeUserText(String(item.area || '').trim()).slice(0, 120) || 'General',
        item: sanitizeUserText(String(item.item || '').trim()).slice(0, 200) || 'Item',
        condition,
        notes: item.notes?.trim()
          ? sanitizeUserText(item.notes.trim()).slice(0, 2000)
          : '',
      };
    });
  }

  private normalizePhotoUrls(urls: string[]): string[] {
    const out: string[] = [];
    for (const raw of urls.slice(0, 20)) {
      assertInspectionPhotoUrl(raw);
      out.push(raw.trim());
    }
    return out;
  }

  private typeLabel(type: InspectionType): string {
    switch (type) {
      case InspectionType.MOVE_IN:
        return 'Move-in';
      case InspectionType.MOVE_OUT:
        return 'Move-out';
      case InspectionType.ROUTINE:
        return 'Routine';
      default:
        return 'Property';
    }
  }

  private async toSummaries(rows: InspectionRecord[]): Promise<InspectionSummary[]> {
    if (rows.length === 0) {
      return [];
    }
    const propertyIds = [...new Set(rows.map((r) => r.propertyId))];
    const tenantIds = [
      ...new Set(rows.map((r) => r.tenantId).filter((id): id is string => !!id)),
    ];

    const properties = await this.propertiesRepository.find({
      where: { id: In(propertyIds) },
    });
    const propertyMap = new Map(properties.map((p) => [p.id, p.name]));

    const tenants =
      tenantIds.length > 0
        ? await this.usersRepository.find({ where: { id: In(tenantIds) } })
        : [];
    const tenantMap = new Map(
      tenants.map((t) => [t.id, { name: t.fullName, email: t.email }]),
    );

    return rows.map((r) => {
      const tenant = r.tenantId ? tenantMap.get(r.tenantId) : undefined;
      return {
        id: r.id,
        propertyId: r.propertyId,
        propertyName: propertyMap.get(r.propertyId) ?? 'Property',
        tenantId: r.tenantId,
        tenantName: tenant?.name ?? null,
        tenantEmail: tenant?.email ?? null,
        type: r.type,
        status: r.status,
        unitLabel: r.unitLabel,
        inspectedAt: String(r.inspectedAt).slice(0, 10),
        overallCondition: r.overallCondition,
        photoCount: Array.isArray(r.photoUrls) ? r.photoUrls.length : 0,
        checklistItemCount: Array.isArray(r.checklistItems)
          ? r.checklistItems.length
          : 0,
        managerSignedAt: r.managerSignedAt
          ? new Date(r.managerSignedAt).toISOString()
          : null,
        tenantSignedAt: r.tenantSignedAt
          ? new Date(r.tenantSignedAt).toISOString()
          : null,
        tenantSignatureName: r.tenantSignatureName,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      };
    });
  }
}
