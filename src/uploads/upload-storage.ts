import { BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const MAINTENANCE_UPLOAD_PATH_PREFIX = '/api/uploads/maintenance/';
export const PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX = '/api/uploads/payment-receipts/';
export const INSPECTION_UPLOAD_PATH_PREFIX = '/api/uploads/inspections/';

const SAFE_FILENAME = /^[a-zA-Z0-9-]+\.(jpg|jpeg|png|gif|webp)$/i;

/** Default cloud from env; used to validate stored Cloudinary URLs. */
export function cloudinaryCloudName(): string {
  return (
    process.env.CLOUDINARY_CLOUD_NAME?.trim() ||
    'da8syamxo'
  ).toLowerCase();
}

export function isCloudinaryUploadUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw.startsWith('https://') && !raw.startsWith('http://')) {
    return false;
  }
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host !== 'res.cloudinary.com' && !host.endsWith('.cloudinary.com')) {
      return false;
    }
    const cloud = cloudinaryCloudName();
    // Typical path: /<cloud_name>/image/upload/...
    return u.pathname.toLowerCase().includes(`/${cloud}/`);
  } catch {
    return false;
  }
}

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
  if (isCloudinaryUploadUrl(url)) {
    return;
  }
  const filename = extractUploadFilename(url, MAINTENANCE_UPLOAD_PATH_PREFIX);
  if (!filename) {
    throw new BadRequestException(
      'Attachment URL must point to an uploaded maintenance image.',
    );
  }
}

export function assertInspectionPhotoUrl(url: string): void {
  if (isCloudinaryUploadUrl(url)) {
    return;
  }
  const filename = extractUploadFilename(url, INSPECTION_UPLOAD_PATH_PREFIX);
  if (!filename) {
    throw new BadRequestException(
      'Photo URL must point to an uploaded inspection image.',
    );
  }
}

export function assertPaymentReceiptPath(path: string): void {
  if (isCloudinaryUploadUrl(path)) {
    return;
  }
  if (!path.startsWith(PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX)) {
    throw new BadRequestException('Invalid receipt path');
  }
  const filename = path.slice(PAYMENT_RECEIPT_UPLOAD_PATH_PREFIX.length);
  if (!filename || filename.includes('/') || filename.includes('..')) {
    throw new BadRequestException('Invalid receipt path');
  }
  assertSafeUploadFilename(filename);
}

export function inspectionUploadRelativePath(filename: string): string {
  assertSafeUploadFilename(filename);
  return `${INSPECTION_UPLOAD_PATH_PREFIX}${filename}`;
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

export function resolveInspectionDiskPath(filename: string): string {
  assertSafeUploadFilename(filename);
  return join(process.cwd(), 'uploads', 'inspections', filename);
}

export function assertUploadFileExists(diskPath: string): void {
  if (!existsSync(diskPath)) {
    throw new NotFoundException('File not found');
  }
}
