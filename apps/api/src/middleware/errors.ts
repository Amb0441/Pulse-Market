import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProd, env } from '../config.js';
import { audit } from './audit.js';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(statusCode: number, code: string, message: string, expose = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }

  static badRequest(message = 'Invalid request', code = 'BAD_REQUEST') {
    return new AppError(400, code, message);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }
  static forbidden(message = 'Not authorized', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  /**
   * Missing dependency: 503 rather than 404, so a misconfiguration does not read as a client error.
   */
  static serviceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    return new AppError(503, code, message);
  }
  static tooLarge(message = 'Payload too large', code = 'PAYLOAD_TOO_LARGE') {
    return new AppError(413, code, message);
  }
  static tooMany(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new AppError(429, code, message);
  }
  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new AppError(500, code, message, false);
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  ENTITY_TOO_LARGE: 413,
  LIMIT_FILE_COUNT: 400,
  LIMIT_UNEXPECTED_FILE: 400,
  ENOENT: 400,
  EBADCSRFTOKEN: 403,
};

/**
 * body-parser and multer failures are http-errors (`status`, `type`); they map to 4xx, never 500.
 */
function parseHttpError(err: unknown): { status: number; code: string; message: string } | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; statusCode?: unknown; type?: unknown; message?: unknown };

  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status === null || status < 400 || status > 499) return null;

  const type = typeof e.type === 'string' ? e.type : undefined;
  const mapped = STATUS_BY_CODE[String((e as { code?: unknown }).code ?? '')];
  const code: string = type ?? (mapped ? String(mapped) : 'BAD_REQUEST');

  const message =
    type === 'entity.parse.failed'
      ? 'Malformed JSON body'
      : type === 'entity.too.large'
        ? 'Request body too large'
        : status === 413
          ? 'Payload too large'
          : 'Invalid request';

  return { status, code, message };
}

/** Wraps async handlers so rejected promises reach the error middleware. */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => unknown | Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let expose = false;

  if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    expose = err.expose;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    expose = true;
    message = 'Request validation failed';
    const details = err.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));
    audit.warn('validation_failed', { path: req.path, details });
    res.status(status).json({ error: { code, message, details } });
    return;
  } else if (err && typeof err === 'object' && 'code' in err && STATUS_BY_CODE[err.code as string]) {
    status = STATUS_BY_CODE[err.code as string];
    code = String(err.code);
    expose = status < 500;
    message = expose ? 'Upload rejected' : message;
  } else {
    const http = parseHttpError(err);
    if (http) {
      audit.warn('malformed_request', { path: req.path, code: http.code, status: http.status });
      res.status(http.status).json({ error: { code: http.code, message: http.message } });
      return;
    }
    if (err instanceof Error) {
      audit.error('unhandled_error', {
        path: req.path,
        method: req.method,
        message: err.message,
        stack: isProd ? undefined : err.stack,
      });
    }
  }

  if (status >= 500) {
    audit.error('request_failed', { path: req.path, method: req.method, code });
  }

  res.status(status).json({
    error: {
      code,
      // Never leak internals: only expose explicit messages or prod-safe ones.
      message: expose ? message : 'Internal server error',
      ...(!isProd && status >= 500 && err instanceof Error
        ? { debug: `${err.name}: ${err.message}` }
        : {}),
    },
  });
}

export const logLevelEnabled = (level: 'silent' | 'error' | 'warn' | 'info') => {
  const order = { silent: 0, error: 1, warn: 2, info: 3 } as const;
  return order[level] <= order[env.LOG_LEVEL];
};
