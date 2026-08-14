import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { sanitizeUserText } from '../common/sanitize-user-text';
import { FcmPushService } from '../firebase/fcm-push.service';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { MaintenanceRealtimeService } from '../maintenance/maintenance-realtime.service';
import { Property } from '../properties/property.entity';
import { TenantNotificationsService } from '../tenant-notifications/tenant-notifications.service';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import type {
  CreateLeaseDto,
  RenewLeaseDto,
  SignLeaseDto,
  TerminateLeaseDto,
  UpdateLeaseDto,
} from './dto/lease.dto';
import { LeaseAgreement } from './lease-agreement.entity';
import { LeasePdfService } from './lease-pdf.service';
import { LeaseStatus } from './lease-status.enum';

export type LeaseSummary = {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string | null;
  tenantEmail: string | null;
  unitLabel: string | null;
  title: string;
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  rentAmount: string;
  securityDeposit: string | null;
  paymentFrequency: string | null;
  daysUntilExpiry: number | null;
  parentLeaseId: string | null;
  tenantSignedAt: string | null;
  managerSignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaseDetail = LeaseSummary & {
  termsText: string;
  documentUrl: string | null;
  tenantSignatureName: string | null;
  managerSignatureName: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
};

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(LeaseAgreement)
    private readonly leasesRepository: Repository<LeaseAgreement>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfilesRepository: Repository<TenantProfile>,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly tenantNotificationsService: TenantNotificationsService,
    private readonly leasePdfService: LeasePdfService,
    private readonly maintenanceRealtime: MaintenanceRealtimeService,
    private readonly fcmPush: FcmPushService,
  ) {}

  async listForManager(managerUserId: string): Promise<LeaseSummary[]> {
    const rows = await this.leasesRepository.find({
      where: { managerUserId },
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    await this.refreshExpiredStatuses(rows);
    return this.toSummaries(rows);
  }

  async getForManager(managerUserId: string, id: string): Promise<LeaseDetail> {
    const row = await this.requireManagerLease(managerUserId, id);
    await this.refreshExpiredStatuses([row]);
    return this.toDetail(row);
  }

  async createForManager(
    managerUserId: string,
    dto: CreateLeaseDto,
  ): Promise<LeaseDetail> {
    await this.assertPropertyOwned(managerUserId, dto.propertyId);
    await this.managersTenantsService.assertTenantBelongsToManager(
      managerUserId,
      dto.tenantId,
    );
    this.assertDateOrder(dto.startDate, dto.endDate);

    const row = this.leasesRepository.create({
      managerUserId,
      propertyId: dto.propertyId,
      tenantId: dto.tenantId,
      unitLabel: dto.unitLabel?.trim()
        ? sanitizeUserText(dto.unitLabel.trim())
        : null,
      title: sanitizeUserText(dto.title.trim()).slice(0, 200),
      status: LeaseStatus.DRAFT,
      startDate: dto.startDate.slice(0, 10),
      endDate: dto.endDate.slice(0, 10),
      rentAmount: sanitizeUserText(dto.rentAmount.trim()).slice(0, 64),
      securityDeposit: dto.securityDeposit?.trim()
        ? sanitizeUserText(dto.securityDeposit.trim()).slice(0, 64)
        : null,
      paymentFrequency: dto.paymentFrequency?.trim()
        ? sanitizeUserText(dto.paymentFrequency.trim()).slice(0, 64)
        : null,
      termsText: sanitizeUserText(dto.termsText.trim()),
      documentUrl: this.normalizeDocumentUrl(dto.documentUrl),
      tenantSignatureName: null,
      tenantSignedAt: null,
      managerSignatureName: null,
      managerSignedAt: null,
      terminatedAt: null,
      terminationReason: null,
      parentLeaseId: null,
    });

    const saved = await this.leasesRepository.save(row);
    return this.getForManager(managerUserId, saved.id);
  }

  async updateForManager(
    managerUserId: string,
    id: string,
    dto: UpdateLeaseDto,
  ): Promise<LeaseDetail> {
    const row = await this.requireManagerLease(managerUserId, id);
    if (row.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft leases can be edited.');
    }

    if (dto.title !== undefined) {
      row.title = sanitizeUserText(dto.title.trim()).slice(0, 200);
    }
    if (dto.unitLabel !== undefined) {
      row.unitLabel = dto.unitLabel?.trim()
        ? sanitizeUserText(dto.unitLabel.trim())
        : null;
    }
    if (dto.startDate !== undefined) {
      row.startDate = dto.startDate.slice(0, 10);
    }
    if (dto.endDate !== undefined) {
      row.endDate = dto.endDate.slice(0, 10);
    }
    this.assertDateOrder(String(row.startDate), String(row.endDate));
    if (dto.rentAmount !== undefined) {
      row.rentAmount = sanitizeUserText(dto.rentAmount.trim()).slice(0, 64);
    }
    if (dto.securityDeposit !== undefined) {
      row.securityDeposit = dto.securityDeposit?.trim()
        ? sanitizeUserText(dto.securityDeposit.trim()).slice(0, 64)
        : null;
    }
    if (dto.paymentFrequency !== undefined) {
      row.paymentFrequency = dto.paymentFrequency?.trim()
        ? sanitizeUserText(dto.paymentFrequency.trim()).slice(0, 64)
        : null;
    }
    if (dto.termsText !== undefined) {
      row.termsText = sanitizeUserText(dto.termsText.trim());
    }
    if (dto.documentUrl !== undefined) {
      row.documentUrl = this.normalizeDocumentUrl(dto.documentUrl ?? undefined);
    }

    await this.leasesRepository.save(row);
    return this.getForManager(managerUserId, id);
  }

  async sendForSignature(
    managerUserId: string,
    id: string,
  ): Promise<LeaseDetail> {
    const row = await this.requireManagerLease(managerUserId, id);
    if (row.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft leases can be sent for signature.');
    }
    if (!row.termsText.trim() || row.termsText.trim().length < 20) {
      throw new BadRequestException('Add lease terms before sending for signature.');
    }

    row.status = LeaseStatus.PENDING_TENANT_SIGNATURE;
    await this.leasesRepository.save(row);

    await this.tenantNotificationsService.createManagerTaskNotificationsForTenants({
      tenantIds: [row.tenantId],
      headline: 'Lease ready for your signature',
      body:
        `Your property manager sent “${row.title}” for review and signature` +
        (row.unitLabel ? ` (unit ${row.unitLabel})` : '') +
        `. Open Lease agreements on your dashboard to review terms and sign.`,
    });

    return this.getForManager(managerUserId, id);
  }

  async countersignForManager(
    managerUserId: string,
    id: string,
    dto: SignLeaseDto,
  ): Promise<LeaseDetail> {
    const row = await this.requireManagerLease(managerUserId, id);
    if (row.status !== LeaseStatus.PENDING_MANAGER_COUNTERSIGNATURE) {
      throw new BadRequestException(
        'This lease is not awaiting your countersignature.',
      );
    }
    const name = sanitizeUserText(dto.signatureName.trim());
    if (!name) {
      throw new BadRequestException('Enter your full name to countersign.');
    }

    row.managerSignatureName = name.slice(0, 200);
    row.managerSignedAt = new Date();
    row.status = LeaseStatus.ACTIVE;
    await this.leasesRepository.save(row);

    if (row.parentLeaseId) {
      const parent = await this.leasesRepository.findOne({
        where: { id: row.parentLeaseId, managerUserId },
      });
      if (
        parent &&
        (parent.status === LeaseStatus.ACTIVE ||
          parent.status === LeaseStatus.EXPIRED)
      ) {
        parent.status = LeaseStatus.SUPERSEDED;
        await this.leasesRepository.save(parent);
      }
    }

    await this.syncTenantProfileFromLease(row);

    await this.tenantNotificationsService.createManagerTaskNotificationsForTenants({
      tenantIds: [row.tenantId],
      headline: 'Lease is fully executed',
      body:
        `“${row.title}” is now active. You can download the signed PDF from Lease agreements.`,
    });

    return this.getForManager(managerUserId, id);
  }

  async terminateForManager(
    managerUserId: string,
    id: string,
    dto: TerminateLeaseDto,
  ): Promise<LeaseDetail> {
    const row = await this.requireManagerLease(managerUserId, id);
    if (
      row.status !== LeaseStatus.ACTIVE &&
      row.status !== LeaseStatus.EXPIRED &&
      row.status !== LeaseStatus.PENDING_TENANT_SIGNATURE &&
      row.status !== LeaseStatus.PENDING_MANAGER_COUNTERSIGNATURE
    ) {
      throw new BadRequestException('This lease cannot be terminated in its current status.');
    }

    row.status = LeaseStatus.TERMINATED;
    row.terminatedAt = new Date();
    row.terminationReason = dto.reason?.trim()
      ? sanitizeUserText(dto.reason.trim())
      : null;
    await this.leasesRepository.save(row);

    await this.tenantNotificationsService.createManagerTaskNotificationsForTenants({
      tenantIds: [row.tenantId],
      headline: 'Lease terminated',
      body: `“${row.title}” was marked terminated by your property manager.`,
    });

    return this.getForManager(managerUserId, id);
  }

  async renewForManager(
    managerUserId: string,
    id: string,
    dto: RenewLeaseDto,
  ): Promise<LeaseDetail> {
    const parent = await this.requireManagerLease(managerUserId, id);
    if (
      parent.status !== LeaseStatus.ACTIVE &&
      parent.status !== LeaseStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Only active or expired leases can be renewed.',
      );
    }
    this.assertDateOrder(dto.startDate, dto.endDate);

    const row = this.leasesRepository.create({
      managerUserId,
      propertyId: parent.propertyId,
      tenantId: parent.tenantId,
      unitLabel: parent.unitLabel,
      title: sanitizeUserText(`${parent.title} (renewal)`).slice(0, 200),
      status: LeaseStatus.DRAFT,
      startDate: dto.startDate.slice(0, 10),
      endDate: dto.endDate.slice(0, 10),
      rentAmount: dto.rentAmount?.trim()
        ? sanitizeUserText(dto.rentAmount.trim()).slice(0, 64)
        : parent.rentAmount,
      securityDeposit: parent.securityDeposit,
      paymentFrequency: parent.paymentFrequency,
      termsText: dto.termsText?.trim()
        ? sanitizeUserText(dto.termsText.trim())
        : parent.termsText,
      documentUrl: parent.documentUrl,
      tenantSignatureName: null,
      tenantSignedAt: null,
      managerSignatureName: null,
      managerSignedAt: null,
      terminatedAt: null,
      terminationReason: null,
      parentLeaseId: parent.id,
    });

    const saved = await this.leasesRepository.save(row);
    return this.getForManager(managerUserId, saved.id);
  }

  async listForTenant(tenantId: string): Promise<LeaseSummary[]> {
    const rows = await this.leasesRepository.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
      take: 100,
    });
    const visible = rows.filter((r) => r.status !== LeaseStatus.DRAFT);
    await this.refreshExpiredStatuses(visible);
    return this.toSummaries(visible);
  }

  async getForTenant(tenantId: string, id: string): Promise<LeaseDetail> {
    const row = await this.leasesRepository.findOne({ where: { id, tenantId } });
    if (!row || row.status === LeaseStatus.DRAFT) {
      throw new NotFoundException('Lease not found');
    }
    await this.refreshExpiredStatuses([row]);
    return this.toDetail(row);
  }

  async signForTenant(
    tenantId: string,
    id: string,
    dto: SignLeaseDto,
  ): Promise<LeaseDetail> {
    const row = await this.leasesRepository.findOne({ where: { id, tenantId } });
    if (!row) {
      throw new NotFoundException('Lease not found');
    }
    if (row.status !== LeaseStatus.PENDING_TENANT_SIGNATURE) {
      throw new BadRequestException('This lease is not awaiting your signature.');
    }
    const name = sanitizeUserText(dto.signatureName.trim());
    if (!name) {
      throw new BadRequestException('Enter your full name to sign.');
    }

    row.tenantSignatureName = name.slice(0, 200);
    row.tenantSignedAt = new Date();
    row.status = LeaseStatus.PENDING_MANAGER_COUNTERSIGNATURE;
    await this.leasesRepository.save(row);

    const user = await this.usersRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'fullName', 'email'],
    });
    const tenantName = user?.fullName?.trim() || user?.email?.trim() || 'A tenant';
    this.maintenanceRealtime.notifyLeaseAwaitingCountersign(
      { id: row.id, tenantId, tenantName, title: row.title },
      [row.managerUserId],
    );
    void this.fcmPush.notifyTenantsMulticast(
      [row.managerUserId],
      'Lease awaiting countersignature',
      `${tenantName} signed “${row.title}”.`,
      { kind: 'lease_awaiting_countersign', leaseId: row.id, tenantId },
    );

    return this.toDetail(row);
  }

  async pdfForManager(managerUserId: string, id: string): Promise<Buffer> {
    const row = await this.requireManagerLease(managerUserId, id);
    return this.renderPdf(row);
  }

  async pdfForTenant(tenantId: string, id: string): Promise<Buffer> {
    const row = await this.leasesRepository.findOne({ where: { id, tenantId } });
    if (!row || row.status === LeaseStatus.DRAFT) {
      throw new NotFoundException('Lease not found');
    }
    return this.renderPdf(row);
  }

  private async renderPdf(row: LeaseAgreement): Promise<Buffer> {
    const [property, tenant, manager] = await Promise.all([
      this.propertiesRepository.findOne({ where: { id: row.propertyId } }),
      this.usersRepository.findOne({ where: { id: row.tenantId } }),
      this.usersRepository.findOne({ where: { id: row.managerUserId } }),
    ]);
    return this.leasePdfService.renderLeasePdf({
      lease: row,
      propertyName: property?.name ?? 'Property',
      tenantFullName: tenant?.fullName ?? null,
      tenantEmail: tenant?.email ?? null,
      managerFullName: manager?.fullName ?? null,
    });
  }

  private async syncTenantProfileFromLease(row: LeaseAgreement): Promise<void> {
    const profile = await this.tenantProfilesRepository.findOne({
      where: { userId: row.tenantId },
    });
    if (!profile) {
      return;
    }
    const property = await this.propertiesRepository.findOne({
      where: { id: row.propertyId },
    });
    const data: Record<string, unknown> = {
      ...(profile.profileData ?? {}),
      leaseStartDate: String(row.startDate).slice(0, 10),
      leaseEndDate: String(row.endDate).slice(0, 10),
      rentAmount: row.rentAmount,
      moveInDate: String(row.startDate).slice(0, 10),
    };
    if (row.securityDeposit) {
      data.securityDeposit = row.securityDeposit;
    }
    if (row.paymentFrequency) {
      data.paymentFrequency = row.paymentFrequency;
    }
    if (row.unitLabel) {
      data.unitNumber = row.unitLabel;
    }
    if (property?.name) {
      data.propertyAssigned = property.name;
    }
    profile.profileData = data;
    await this.tenantProfilesRepository.save(profile);
  }

  private async refreshExpiredStatuses(rows: LeaseAgreement[]): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const toExpire = rows.filter(
      (r) =>
        r.status === LeaseStatus.ACTIVE &&
        String(r.endDate).slice(0, 10) < today,
    );
    if (toExpire.length === 0) {
      return;
    }
    for (const row of toExpire) {
      row.status = LeaseStatus.EXPIRED;
    }
    await this.leasesRepository.save(toExpire);
  }

  private async requireManagerLease(
    managerUserId: string,
    id: string,
  ): Promise<LeaseAgreement> {
    const row = await this.leasesRepository.findOne({
      where: { id, managerUserId },
    });
    if (!row) {
      throw new NotFoundException('Lease not found');
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

  private assertDateOrder(startDate: string, endDate: string): void {
    if (startDate.slice(0, 10) > endDate.slice(0, 10)) {
      throw new BadRequestException('End date must be on or after start date.');
    }
  }

  private normalizeDocumentUrl(raw?: string): string | null {
    const value = raw?.trim();
    if (!value) {
      return null;
    }
    if (!/^https?:\/\//i.test(value)) {
      throw new BadRequestException(
        'Document URL must start with http:// or https://',
      );
    }
    return value.slice(0, 1000);
  }

  private daysUntilExpiry(endDate: string, status: LeaseStatus): number | null {
    if (
      status !== LeaseStatus.ACTIVE &&
      status !== LeaseStatus.PENDING_TENANT_SIGNATURE &&
      status !== LeaseStatus.PENDING_MANAGER_COUNTERSIGNATURE
    ) {
      return null;
    }
    const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00Z`);
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    return Math.round((end.getTime() - todayUtc) / 86_400_000);
  }

  private async toSummaries(rows: LeaseAgreement[]): Promise<LeaseSummary[]> {
    if (rows.length === 0) {
      return [];
    }
    const propertyIds = [...new Set(rows.map((r) => r.propertyId))];
    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const [properties, tenants] = await Promise.all([
      this.propertiesRepository.find({ where: { id: In(propertyIds) } }),
      this.usersRepository.find({ where: { id: In(tenantIds) } }),
    ]);
    const propertyMap = new Map(properties.map((p) => [p.id, p.name]));
    const tenantMap = new Map(
      tenants.map((t) => [t.id, { name: t.fullName, email: t.email }]),
    );

    return rows.map((r) => {
      const tenant = tenantMap.get(r.tenantId);
      return {
        id: r.id,
        propertyId: r.propertyId,
        propertyName: propertyMap.get(r.propertyId) ?? 'Property',
        tenantId: r.tenantId,
        tenantName: tenant?.name ?? null,
        tenantEmail: tenant?.email ?? null,
        unitLabel: r.unitLabel,
        title: r.title,
        status: r.status,
        startDate: String(r.startDate).slice(0, 10),
        endDate: String(r.endDate).slice(0, 10),
        rentAmount: r.rentAmount,
        securityDeposit: r.securityDeposit,
        paymentFrequency: r.paymentFrequency,
        daysUntilExpiry: this.daysUntilExpiry(String(r.endDate), r.status),
        parentLeaseId: r.parentLeaseId,
        tenantSignedAt: r.tenantSignedAt
          ? new Date(r.tenantSignedAt).toISOString()
          : null,
        managerSignedAt: r.managerSignedAt
          ? new Date(r.managerSignedAt).toISOString()
          : null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      };
    });
  }

  private async toDetail(row: LeaseAgreement): Promise<LeaseDetail> {
    const [summary] = await this.toSummaries([row]);
    return {
      ...summary,
      termsText: row.termsText,
      documentUrl: row.documentUrl,
      tenantSignatureName: row.tenantSignatureName,
      managerSignatureName: row.managerSignatureName,
      terminatedAt: row.terminatedAt
        ? new Date(row.terminatedAt).toISOString()
        : null,
      terminationReason: row.terminationReason,
    };
  }
}
