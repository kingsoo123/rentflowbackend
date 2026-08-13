import { memoryStorage } from 'multer';

/** Shared multer config: keep file in memory for Cloudinary upload (max 5 MB images). */
export const imageUploadMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'), false);
      return;
    }
    cb(null, true);
  },
} as const;

export type MemoryUploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};
