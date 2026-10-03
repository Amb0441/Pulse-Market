import { v2 as cloudinary } from 'cloudinary';
import { env, hasCloudinary } from '../config.js';
import { audit } from '../middleware/audit.js';
import { AppError } from '../middleware/errors.js';

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface StoredImage {
  url: string;
  public_id: string;
  width: number;
  height: number;
}

export const FOLDER_ROOT = 'pulse-market';

/**
 * Per-user folder, e.g. `pulse-market/<userId>`; ownership lives in the path, checked by `belongsToUser`.
 */
export function userFolder(userId: string): string {
  return `${FOLDER_ROOT}/${userId}`;
}

/** True when `publicId` sits inside exactly this user's own folder. */
export function belongsToUser(publicId: string, userId: string): boolean {
  return publicId.startsWith(`${userFolder(userId)}/`);
}

function uploadBuffer(buffer: Buffer, folder: string): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        type: 'upload',
        // Re-validate server-side and strip metadata (EXIF GPS/author leakage).
        overwrite: false,
        transformation: [
          { width: 1600, height: 1600, crop: 'limit' },
          { fetch_format: 'auto', quality: 'auto:good' },
        ],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        const rawUrl = result.secure_url || result.url || '';
        resolve({
          url: rawUrl.replace(/^http:\/\//i, 'https://'),
          public_id: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });
}

export async function storeImages(
  files: Express.Multer.File[],
  userId: string,
): Promise<StoredImage[]> {
  if (!hasCloudinary) {
    audit.warn('upload_skipped_no_cloudinary', { count: files.length });
    return [];
  }
  const folder = userFolder(userId);
  const settled = await Promise.allSettled(files.map((f) => uploadBuffer(f.buffer, folder)));
  const stored = settled
    .filter((r): r is PromiseFulfilledResult<StoredImage> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (stored.length !== files.length) {
    audit.warn('upload_partial_failure', {
      requested: files.length,
      stored: stored.length,
    });
  }
  if (!stored.length) {
    const first = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const reason = first?.reason as { message?: string; http_code?: number } | undefined;
    audit.warn('upload_failed', { userId, message: reason?.message, http_code: reason?.http_code });
    const code = reason?.http_code;
    if (code === 400 || code === 401 || code === 403) {
      throw AppError.badRequest(
        'Photo storage rejected that file. Check Cloudinary credentials and try a JPG or PNG.',
        'UPLOAD_REJECTED',
      );
    }
    throw AppError.serviceUnavailable('Photo uploads are unavailable right now. Please try again shortly.');
  }
  return stored;
}

export type DestroyOutcome = 'deleted' | 'missing';

/**
 * Deletes an asset the caller owns: 'deleted' when Cloudinary removed it, 'missing' when it was already gone.
 */
export async function destroyImage(publicId: string, userId: string): Promise<DestroyOutcome> {
  // Defence in depth: the route checks ownership, but this service refuses to
  // delete anything outside the caller's own folder even if reached elsewhere.
  if (!belongsToUser(publicId, userId)) {
    audit.warn('image_delete_scope_violation', { userId });
    throw new Error('Refusing to delete an asset outside the caller folder');
  }
  if (!hasCloudinary) {
    audit.warn('image_delete_no_storage', { userId });
    throw AppError.serviceUnavailable('Image storage is not configured');
  }

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });
  return result?.result === 'ok' ? 'deleted' : 'missing';
}
