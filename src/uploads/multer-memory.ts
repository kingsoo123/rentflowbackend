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

/** Images or PDFs up to 10 MB for property documents. */
export const documentUploadMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf';
    if (!ok) {
      cb(new Error('Only image or PDF files are allowed'), false);
      return;
    }
    cb(null, true);
  },
} as const;
