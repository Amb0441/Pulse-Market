import { ApiError } from './api';

/**
 * Turns API error codes and zod field details into sentences a person can act on.
 */

/** Maps an API error `code` to plain English. */
const BY_CODE: Record<string, string> = {
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  INVALID_CREDENTIALS: 'That email and password combination is not correct.',
  EMAIL_TAKEN: 'An account already exists with that email address.',
  SIGNUP_FAILED: 'We could not create your account. Please try again in a moment.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  CORS_DENIED: 'The app is not allowed to reach the server. Check FRONTEND_URL.',
  NOT_FOUND: 'We could not find what you were looking for.',
  EMAIL_CONFLICT: 'That email address is already in use.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  AUTH_RATE_LIMITED: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
  PAYLOAD_TOO_LARGE: 'That file is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'That file type is not supported. Use a JPG, PNG or WebP image.',
  IMAGE_TYPE_NOT_ALLOWED: 'That file type is not supported. Use a JPG, PNG or WebP image.',
  IMAGE_TOO_LARGE: 'That image is too large.',
  LIMIT_FILE_COUNT: 'Too many files at once.',
  SERVICE_UNAVAILABLE: 'Photo uploads are unavailable right now. Please try again shortly.',
  MALFORMED_JSON: 'Something went wrong sending that request. Please try again.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again.',
  OFFLINE: 'You appear to be offline. Check your connection and try again.',
};

/** Fallbacks by status, for codes we do not recognise. */
const BY_STATUS: Record<number, string> = {
  400: 'That did not look right. Please check and try again.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with something that already exists.',
  413: 'That file is too large.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again.',
  502: 'The server is not responding properly. Please try again.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The server took too long to respond. Please try again.',
};

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Per-field messages from a validation failure, keyed by field name.
 */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!isApiError(err) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details) {
    if (!d?.field || !d.message) continue;
    // Only the first complaint per field; a select can fail several checks at once.
    if (!(d.field in out)) out[d.field] = tidy(d.message);
  }
  return out;
}

/**
 * A single sentence describing the failure, preferring the first field message.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback;

  if (typeof err === 'string') return tidy(err);

  if (isApiError(err)) {
    const fields = fieldErrors(err);
    const first = Object.values(fields)[0];
    if (first) return first;

    if (BY_CODE[err.code]) return BY_CODE[err.code];
    if (BY_STATUS[err.status]) return BY_STATUS[err.status];

    // The API already sends developer-facing text; use it rather than nothing.
    if (err.message && !/^(internal server error|request validation failed)$/i.test(err.message)) {
      return tidy(err.message);
    }
    return BY_STATUS[err.status] ?? fallback;
  }

  if (err instanceof Error) {
    // Browser fetch failures ("Failed to fetch") mean nothing to a user.
    if (/failed to fetch|networkerror|load failed/i.test(err.message)) {
      return 'We could not reach the server. Please check your connection and try again.';
    }
    return tidy(err.message) || fallback;
  }

  return fallback;
}

/** Trims and sentence-cases provider messages so they read consistently. */
function tidy(message: string): string {
  let m = message.trim();
  if (!m) return '';
  // Zod paths leak into some messages; keep the sentence only.
  m = m.replace(/\s+/g, ' ');
  if (!/[.!?:]$/.test(m)) m += '.';
  return m.charAt(0).toUpperCase() + m.slice(1);
}
