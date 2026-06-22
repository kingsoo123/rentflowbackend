import { BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const MAINTENANCE_UPLOAD_PATH_PREFIX = '/api/uploads/maintenance/';
export const PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX = '/api/uploads/payment-receipts/';

const SAFE_FILENAME = /^[a-zA-Z0-9-]+\.(jpg|jpeg|png|gif|webp)$/i;

export function assertSafeUploadFilename(filename: string): void {
  if (!filename || filename.includes('..') || filename.includes('/') || !SAFE_FILENAME.test(filename)) {
    throw new BadRequestException('Invalid file name');
  }
}

export function maintenanceUploadRelativePath(filename: string): string {
  assertSafeUploadFilename(filename);
  return `${MAINTENANCE_UPLOAD_PATH_PREFIX}${filename}`;
}

export function paymentReceiptUploadRelativePath(filename: string): string {
  assertSafeUploadFilename(filename);
  return `${PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX}${filename}`;
}

export function extractUploadFilename(pathOrUrl: string, prefix: string): string | null {
  const raw = pathOrUrl.trim();
  if (!raw) {
    return null;
  }
  try {
    const pathname = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw).pathname
      : raw.startsWith('/')
        ? raw
        : `/${raw}`;
    const idx = pathname.indexOf(prefix);
    if (idx < 0) {
      return null;
    }
    const filename = pathname.slice(idx + prefix.length);
    if (!filename || filename.includes('/')) {
      return null;
    }
    assertSafeUploadFilename(filename);
    return filename;
  } catch {
    return null;
  }
}

export function assertMaintenanceAttachmentUrl(url: string): void {
  const filename = extractUploadFilename(url, MAINTENANCE_UPLOAD_PATH_PREFIX);
  if (!filename) {
    throw new BadRequestException('Attachment URL must point to an uploaded maintenance image.');
  }
}

export function contentTypeForUploadFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

export function resolveMaintenanceDiskPath(filename: string): string {
  assertSafeUploadFilename(filename);
  return join(process.cwd(), 'uploads', 'maintenance', filename);
}

export function resolvePaymentReceiptDiskPath(filename: string): string {
  assertSafeUploadFilename(filename);
  return join(process.cwd(), 'uploads', 'payment-receipts', filename);
}

export function assertUploadFileExists(diskPath: string): void {
  if (!existsSync(diskPath)) {
    throw new NotFoundException('File not found');
  }
}
