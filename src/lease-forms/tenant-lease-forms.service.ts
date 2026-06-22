import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { FcmPushService } from '../firebase/fcm-push.service';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { MaintenanceRealtimeService } from '../maintenance/maintenance-realtime.service';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { SubmitLeaseFormDto } from './dto/submit-lease-form.dto';
import { sanitizeUserText } from '../common/sanitize-user-text';
import {
  getLeaseFormTemplate,
  listLeaseFormTemplates,
  type LeaseFormTemplateDef,
} from './lease-form-template';
import { LeaseFormPdfService } from './lease-form-pdf.service';
import { TenantLeaseFormSubmission } from './tenant-lease-form-submission.entity';

function strFromProfile(
  profile: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!profile) {
    return null;
  }
  const v = profile[key];
  if (v === undefined || v === null) {
    return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

@Injectable()
export class TenantLeaseFormsService {
  private readonly logger = new Logger(TenantLeaseFormsService.name);

  constructor(
    @InjectRepository(TenantLeaseFormSubmission)
    private readonly submissionsRepository: Repository<TenantLeaseFormSubmission>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    private readonly managersTenantsService: ManagersTenantsService,
    private readonly maintenanceRealtime: MaintenanceRealtimeService,
    private readonly fcmPush: FcmPushService,
    private readonly leaseFormPdf: LeaseFormPdfService,
  ) {}

  listTemplates() {
    return listLeaseFormTemplates().map((t) => ({
      slug: t.slug,
      title: t.title,
      intro: t.intro,
      fields: t.fields,
      signaturePrompt: t.signaturePrompt,
    }));
  }

  async listMySubmissions(tenantId: string) {
    try {
      const rows = await this.submissionsRepository.find({
        where: { tenantId },
        order: { submittedAt: 'DESC' },
        take: 50,
      });
      return rows.map((r) => ({
        id: r.id,
        formSlug: r.formSlug,
        submittedAt: r.submittedAt.toISOString(),
      }));
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        this.logger.warn(`listMySubmissions DB [${code ?? '?'}]: ${err.message}`);
        if (
          code === '42P01' ||
          (err.message.includes('relation') && err.message.includes('does not exist'))
        ) {
          throw new ServiceUnavailableException(
            'Database is missing the tenant_lease_form_submissions table. From real_estate_backend run: npm run typeorm:migration:run',
          );
        }
      }
      this.logger.error(
        'listMySubmissions failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Could not load lease form submissions. Check API logs.',
      );
    }
  }

  async assertSubmissionOwnedByTenant(
    tenantId: string,
    submissionId: string,
  ): Promise<TenantLeaseFormSubmission> {
    const row = await this.submissionsRepository.findOne({
      where: { id: submissionId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Submission not found');
    }
    return row;
  }

  async buildPdfForTenant(tenantId: string, submissionId: string): Promise<Buffer> {
    const submission = await this.assertSubmissionOwnedByTenant(tenantId, submissionId);
    const template = getLeaseFormTemplate(submission.formSlug);
    if (!template) {
      throw new NotFoundException('Form template no longer available');
    }
    const { fullName, email, unitLine } = await this.getTenantContext(tenantId);
    return this.leaseFormPdf.renderSubmissionPdf({
      submission,
      template,
      tenantFullName: fullName,
      tenantEmail: email,
      unitLine: unitLine,
    });
  }

  private async getTenantContext(tenantId: string): Promise<{
    fullName: string | null;
    email: string | null;
    unitLine: string | null;
  }> {
    const user = await this.usersRepository.findOne({
      where: { id: tenantId, role: UserRole.TENANT },
      select: ['id', 'fullName', 'email'],
    });
    const tpRow = await this.tenantProfileRepository.findOne({
      where: { userId: tenantId },
    });
    const profile =
      tpRow?.profileData &&
      typeof tpRow.profileData === 'object' &&
      !Array.isArray(tpRow.profileData)
        ? (tpRow.profileData as Record<string, unknown>)
        : undefined;
    const unit = strFromProfile(profile, 'unitNumber');
    const prop = strFromProfile(profile, 'propertyAssigned');
    let unitLine: string | null = null;
    if (prop || unit) {
      const parts = [prop, unit ? `Unit ${unit}` : null].filter(Boolean);
      unitLine = parts.join(' · ');
    }
    return {
      fullName: user?.fullName?.trim() || null,
      email: user?.email?.trim() || null,
      unitLine,
    };
  }

  normalizeAnswers(
    template: LeaseFormTemplateDef,
    raw: Record<string, unknown>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of template.fields) {
      const v = raw[field.key];
      if (field.type === 'checkbox') {
        const b =
          v === true ||
          v === 1 ||
          (typeof v === 'string' && ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()));
        out[field.key] = b ? 'true' : 'false';
      } else if (typeof v === 'string') {
        out[field.key] = sanitizeUserText(v);
      } else if (v === null || v === undefined) {
        out[field.key] = '';
      } else {
        out[field.key] = sanitizeUserText(String(v));
      }
    }
    for (const key of Object.keys(raw)) {
      if (!template.fields.some((f) => f.key === key)) {
        throw new BadRequestException(`Unexpected field: ${key}`);
      }
    }
    return out;
  }

  validateAnswers(template: LeaseFormTemplateDef, answers: Record<string, string>): void {
    for (const field of template.fields) {
      const val = answers[field.key] ?? '';
      if (!field.required) {
        continue;
      }
      if (field.type === 'checkbox') {
        if (val !== 'true') {
          throw new BadRequestException(`You must accept: ${field.label}`);
        }
        continue;
      }
      if (!val.trim()) {
        throw new BadRequestException(`Missing required field: ${field.label}`);
      }
    }
  }

  async submit(tenantId: string, dto: SubmitLeaseFormDto) {
    const template = getLeaseFormTemplate(dto.formSlug.trim());
    if (!template) {
      throw new BadRequestException('Unknown formSlug');
    }
    let answers: Record<string, string>;
    try {
      answers = this.normalizeAnswers(template, dto.answers);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException('Invalid answers payload');
    }
    this.validateAnswers(template, answers);

    const row = this.submissionsRepository.create({
      tenantId,
      formSlug: template.slug,
      answers,
      signatureText: dto.signatureText.trim(),
    });
    let saved: TenantLeaseFormSubmission;
    try {
      saved = await this.submissionsRepository.save(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        this.logger.warn(`submit lease form DB [${code ?? '?'}]: ${err.message}`);
        if (
          code === '42P01' ||
          (err.message.includes('relation') && err.message.includes('does not exist'))
        ) {
          throw new ServiceUnavailableException(
            'Database is missing the tenant_lease_form_submissions table. From real_estate_backend run: npm run typeorm:migration:run',
          );
        }
      }
      this.logger.error(
        'submit lease form save failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not save lease form. Check API logs.');
    }

    const user = await this.usersRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'fullName', 'email'],
    });
    const tenantName = user?.fullName?.trim() || user?.email?.trim() || 'A tenant';

    const managerUserIds =
      await this.managersTenantsService.listManagerUserIdsForTenantOnRoster(tenantId);

    this.maintenanceRealtime.notifyLeaseFormSubmitted(
      { id: saved.id, tenantId, tenantName },
      managerUserIds,
    );

    const title = 'Lease form submitted';
    const body = `${tenantName} submitted "${template.title}".`;
    void this.fcmPush.notifyTenantsMulticast(managerUserIds, title, body, {
      kind: 'lease_form_submitted',
      submissionId: saved.id,
      tenantId,
    });

    return {
      id: saved.id,
      formSlug: saved.formSlug,
      submittedAt: saved.submittedAt.toISOString(),
    };
  }

  async listForManager(managerUserId: string) {
    const rosterIds = await this.managersTenantsService.listTenantIdsOnManagerRoster(
      managerUserId,
      500,
    );
    if (rosterIds.length === 0) {
      return [];
    }
    let rows: TenantLeaseFormSubmission[];
    try {
      rows = await this.submissionsRepository.find({
        where: { tenantId: In(rosterIds) },
        order: { submittedAt: 'DESC' },
        take: 100,
      });
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        this.logger.warn(`listForManager DB [${code ?? '?'}]: ${err.message}`);
        if (
          code === '42P01' ||
          (err.message.includes('relation') && err.message.includes('does not exist'))
        ) {
          throw new ServiceUnavailableException(
            'Database is missing the tenant_lease_form_submissions table. From real_estate_backend run: npm run typeorm:migration:run',
          );
        }
      }
      this.logger.error(
        'listForManager failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not load lease form submissions.');
    }
    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const users = await this.usersRepository.find({
      where: { id: In(tenantIds) },
      select: ['id', 'fullName', 'email'],
    });
    const byId = new Map(users.map((u) => [u.id, u] as const));
    return rows.map((r) => {
      const u = byId.get(r.tenantId);
      return {
        id: r.id,
        tenantId: r.tenantId,
        formSlug: r.formSlug,
        submittedAt: r.submittedAt.toISOString(),
        tenantName: u?.fullName?.trim() || u?.email || 'Tenant',
        tenantEmail: u?.email ?? null,
      };
    });
  }

  async assertManagerCanAccessSubmission(
    managerUserId: string,
    submissionId: string,
  ): Promise<TenantLeaseFormSubmission> {
    const row = await this.submissionsRepository.findOne({
      where: { id: submissionId },
    });
    if (!row) {
      throw new NotFoundException('Submission not found');
    }
    await this.managersTenantsService.assertTenantBelongsToManager(
      managerUserId,
      row.tenantId,
    );
    return row;
  }

  async buildPdfForManager(
    managerUserId: string,
    submissionId: string,
  ): Promise<Buffer> {
    const submission = await this.assertManagerCanAccessSubmission(
      managerUserId,
      submissionId,
    );
    const template = getLeaseFormTemplate(submission.formSlug);
    if (!template) {
      throw new NotFoundException('Form template no longer available');
    }
    const { fullName, email, unitLine } = await this.getTenantContext(submission.tenantId);
    return this.leaseFormPdf.renderSubmissionPdf({
      submission,
      template,
      tenantFullName: fullName,
      tenantEmail: email,
      unitLine,
    });
  }
}
