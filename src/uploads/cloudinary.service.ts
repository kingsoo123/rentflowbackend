import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';

/** Existing Media Library folder on this Cloudinary account. */
export const CLOUDINARY_RENT_PILOT_FOLDER = 'rent-pilot';

export type CloudinaryAssetKind =
  | 'maintenance'
  | 'payment-receipts'
  | 'inspections';

export type CloudinaryUploadResult = {
  /** Stored in DB — Cloudinary HTTPS URL (also used as `path` for clients). */
  path: string;
  url: string;
  publicId: string;
};

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private configured = false;

  constructor(private readonly configService: ConfigService) {
    this.configure();
  }

  private configure(): void {
    const cloudName =
      this.configService.get<string>('cloudinary.cloudName')?.trim() ||
      process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey =
      this.configService.get<string>('cloudinary.apiKey')?.trim() ||
      process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret =
      this.configService.get<string>('cloudinary.apiSecret')?.trim() ||
      process.env.CLOUDINARY_API_SECRET?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      this.configured = false;
      this.logger.warn(
        'Cloudinary is not fully configured (need CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Uploads will fail until set.',
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.configured = true;
  }

  assertConfigured(): void {
    if (!this.configured) {
      this.configure();
    }
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'File uploads are unavailable: Cloudinary credentials are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }
  }

  async uploadImageBuffer(
    buffer: Buffer,
    kind: CloudinaryAssetKind,
    options?: { filenameHint?: string; mimeType?: string },
  ): Promise<CloudinaryUploadResult> {
    this.assertConfigured();

    const publicIdBase = options?.filenameHint
      ?.replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 80);

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_RENT_PILOT_FOLDER,
          resource_type: 'image',
          overwrite: false,
          unique_filename: true,
          use_filename: Boolean(publicIdBase),
          tags: [kind, 'rent-pilot'],
        },
        (err, uploadResult) => {
          if (err || !uploadResult) {
            reject(err ?? new Error('Cloudinary upload returned empty result'));
            return;
          }
          resolve(uploadResult);
        },
      );
      Readable.from(buffer).pipe(stream);
    });

    const url = result.secure_url;
    if (!url) {
      throw new ServiceUnavailableException('Cloudinary upload did not return a URL');
    }

    return {
      path: url,
      url,
      publicId: result.public_id,
    };
  }
}
