import multer from 'multer';
import path from 'node:path';
import type { RequestHandler } from 'express';
import { ALLOWED_IMAGE_EXT, ALLOWED_IMAGE_MIME } from '../schemas.js';
import { maxUploadBytes } from '../config.js';
import { AppError } from './errors.js';
import { audit } from './audit.js';

/** Magic-byte checks: declared type/extension are attacker-controlled, so trust only the real bytes. */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function detectImageMime(buffer: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(buffer))?.mime ?? null;
}

const storage = multer.memoryStorage();

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: maxUploadBytes,
    files: 5,
    // Cap non-file fields so multipart bodies can't be abused for memory blowup.
    fields: 10,
    parts: 20,
    headerPairs: 100,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      audit.warn('upload_rejected_mime', { mimetype: file.mimetype });
      return cb(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG or WebP images are allowed'));
    }
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      audit.warn('upload_rejected_ext', { ext });
      return cb(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Invalid image file extension'));
    }
    cb(null, true);
  },
});

/** Multer middleware for handling up to 5 images. */
export const uploadImages = uploadMiddleware.array('images', 5) as unknown as RequestHandler;

/** Post-multer content verification, applied after the buffer is in memory. */
export function assertRealImages(files: Express.Multer.File[]) {
  for (const file of files) {
    const detected = detectImageMime(file.buffer);
    if (!detected) {
      audit.warn('upload_rejected_signature', { name: file.originalname });
      throw new AppError(415, 'INVALID_IMAGE', 'File content is not a valid image');
    }
    if (detected !== file.mimetype) {
      audit.warn('upload_mime_mismatch', { declared: file.mimetype, detected });
      throw new AppError(415, 'INVALID_IMAGE', 'File content does not match its type');
    }
  }
}