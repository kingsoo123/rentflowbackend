import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, type ReadStream } from 'node:fs';
import { Repository } from 'typeorm';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { MaintenanceRequest } from '../maintenance/maintenance-request.entity';
import { ManagersTenantsService } from '../managers/managers-tenants.service';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';
import { UserRole } from '../users/user-role.enum';
import {
  assertSafeUploadFilename,
  assertUploadFileExists,
  contentTypeForUploadFilename,
  MAINTENANCE_UPLOAD_PATH_PREFIX,
  paymentReceiptUploadRelativePath,
  resolveMaintenanceDiskPath,
  resolvePaymentReceiptDiskPath,
} from './upload-storage';

@Injectable()
export class SecuredUploadsService {
  constructor(
    @InjectRepository(TenantPaymentConfirmation)
    private readonly confirmationsRepository: Repository<TenantPaymentConfirmation>,
    @InjectRepository(MaintenanceRequest)
    private readonly maintenanceRepository: Repository<MaintenanceRequest>,
    private readonly managersTenantsService: ManagersTenantsService,
  ) {}

  async openPaymentReceipt(
    user: JwtAccessPayload,
    filename: string,
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const row = await this.loadPaymentReceiptRow(filename);
    await this.assertUserCanAccessTenantUpload(user, row.tenantId);
    const diskPath = resolvePaymentReceiptDiskPath(filename);
    assertUploadFileExists(diskPath);
    return {
      stream: createReadStream(diskPath),
      contentType: contentTypeForUploadFilename(filename),
    };
  }

  async openMaintenanceAttachment(
    user: JwtAccessPayload,
    filename: string,
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const row = await this.loadMaintenanceRow(filename);
    await this.assertUserCanAccessTenantUpload(user, row.tenantId);
    const diskPath = resolveMaintenanceDiskPath(filename);
    assertUploadFileExists(diskPath);
    return {
      stream: createReadStream(diskPath),
      contentType: contentTypeForUploadFilename(filename),
    };
  }

  private async loadPaymentReceiptRow(filename: string): Promise<TenantPaymentConfirmation> {
    assertSafeUploadFilename(filename);
    const receiptPath = paymentReceiptUploadRelativePath(filename);
    const row = await this.confirmationsRepository.findOne({
      where: { receiptImagePath: receiptPath },
    });
    if (!row) {
      throw new NotFoundException('File not found');
    }
    return row;
  }

  private async loadMaintenanceRow(filename: string): Promise<MaintenanceRequest> {
    assertSafeUploadFilename(filename);
    const suffix = `%${MAINTENANCE_UPLOAD_PATH_PREFIX}${filename}%`;
    const row = await this.maintenanceRepository
      .createQueryBuilder('m')
      .where('m.attachment_urls::text ILIKE :suffix', { suffix })
      .getOne();
    if (!row) {
      throw new NotFoundException('File not found');
    }
    return row;
  }

  private async assertUserCanAccessTenantUpload(
    user: JwtAccessPayload,
    tenantId: string,
  ): Promise<void> {
    if (user.role === UserRole.TENANT) {
      if (user.sub !== tenantId) {
        throw new ForbiddenException('You do not have access to this file');
      }
      return;
    }
    if (user.role === UserRole.PROPERTY_MANAGER) {
      await this.managersTenantsService.assertTenantBelongsToManager(user.sub, tenantId);
      return;
    }
    throw new ForbiddenException('You do not have access to this file');
  }
}
