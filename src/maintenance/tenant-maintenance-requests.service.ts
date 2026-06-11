import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { SubmitMaintenanceRequestDto } from './dto/submit-maintenance-request.dto';
import { MaintenanceRequest } from './maintenance-request.entity';
import { MaintenanceRequestStatus } from './maintenance-request-status.enum';
import { MaintenanceRealtimeService } from './maintenance-realtime.service';

export type SubmittedMaintenanceResponse = {
  id: string;
  title: string;
  description: string;
  urgency: string;
  status: string;
  attachmentUrls: string[];
  createdAt: Date;
  updatedAt: Date;
};

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

@Injectable()
export class TenantMaintenanceRequestsService {
  private readonly logger = new Logger(TenantMaintenanceRequestsService.name);

  constructor(
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    private readonly maintenanceRealtime: MaintenanceRealtimeService,
    private readonly managersTenantsService: ManagersTenantsService,
  ) {}

  /** All requests for this tenant, newest first (overview / track). */
  async listForTenant(tenantId: string): Promise<SubmittedMaintenanceResponse[]> {
    try {
      const rows = await this.maintenanceRepository.find({
        where: { tenantId },
        order: { createdAt: 'DESC' },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        urgency: r.urgency,
        status: r.status,
        attachmentUrls: Array.isArray(r.attachmentUrls) ? r.attachmentUrls : [],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        this.logger.warn(`listForTenant DB [${code ?? '?'}]: ${err.message}`);
        if (
          code === '42P01' ||
          (err.message.includes('relation') && err.message.includes('does not exist'))
        ) {
          throw new ServiceUnavailableException(
            'Database is missing the maintenance_requests table. From real_estate_backend run: npm run typeorm:migration:run',
          );
        }
      }
      this.logger.error(
        'listForTenant failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Could not load maintenance requests. Check API logs.',
      );
    }
  }

  async createForTenant(
    tenantId: string,
    dto: SubmitMaintenanceRequestDto,
  ): Promise<SubmittedMaintenanceResponse> {
    const urls = dto.attachmentUrls?.length ? dto.attachmentUrls : [];
    try {
      const entity = this.maintenanceRepository.create({
        tenantId,
        title: dto.title,
        description: dto.description,
        urgency: dto.urgency,
        status: MaintenanceRequestStatus.SUBMITTED,
        attachmentUrls: urls,
      });
      const saved = await this.maintenanceRepository.save(entity);
      const managerUserIds =
        await this.managersTenantsService.listManagerUserIdsForTenantOnRoster(tenantId);
      this.maintenanceRealtime.notifyMaintenanceCreated({ id: saved.id }, managerUserIds);
      return {
        id: saved.id,
        title: saved.title,
        description: saved.description,
        urgency: saved.urgency,
        status: saved.status,
        attachmentUrls: Array.isArray(saved.attachmentUrls)
          ? saved.attachmentUrls
          : [],
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        this.logger.warn(`createForTenant DB [${code ?? '?'}]: ${err.message}`);
        if (
          code === '42P01' ||
          (err.message.includes('relation') && err.message.includes('does not exist'))
        ) {
          throw new ServiceUnavailableException(
            'Database is missing the maintenance_requests table. From real_estate_backend run: npm run typeorm:migration:run',
          );
        }
      }
      this.logger.error(
        'createForTenant failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Could not save maintenance request. Check API logs.',
      );
    }
  }
}
