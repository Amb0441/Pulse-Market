import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { allowedOrigins, env, isProd } from '../config.js';
import { AppError, asyncHandler } from './errors.js';
import { audit } from './audit.js';

// --- Security headers -------------------------------------------------------

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            // Vite injects inline styles for Tailwind; keep styles but not scripts.
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
            'connect-src': ["'self'", ...allowedOrigins],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
            'style-src-elem': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'none'"],
            'upgrade-insecure-requests': [],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProd
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
      : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  });
}

/** Strip the noisy headers helmet adds that break the Vite dev client. */
export function devHeaderOverrides(_req: Request, res: Response, next: NextFunction) {
  if (isProd) return next();
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  next();
}

// --- CORS: explicit allowlist, never reflected ------------------------------

/**
 * Loopback origin ignoring the port (Vite moves when 5173 is busy); dev only, prod uses `allowedOrigins`.
 */
function isCloudflarePagesOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'pages.dev' || host.endsWith('.pages.dev');
}

function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function corsMiddleware() {
  return cors({
    origin(origin, callback) {
      // Same-origin, curl, server-to-server: no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (env.ALLOW_CLOUDFLARE_PAGES && isCloudflarePagesOrigin(origin)) return callback(null, true);
      if (!isProd && isLoopbackOrigin(origin)) return callback(null, true);
      audit.warn('cors_rejected', { origin, allowed: allowedOrigins });
      return callback(
        new AppError(
          403,
          'CORS_DENIED',
          'Origin not allowed. Add it to FRONTEND_URL in apps/api/.env.',
        ),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}

// --- Rate limiting ----------------------------------------------------------

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Key on user id when authenticated, else IP (IPv6-safe).
  keyGenerator: (req) => (req as any).user?.id ?? ipKeyGenerator(req.ip ?? ''),
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    });
  },
};

/**
 * Broad ceiling for the whole API; the realtime stream is exempt (capped by MAX_STREAMS_PER_USER).
 */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 10_000 : 300,
  skip: (req) => req.path === '/api/v1/realtime' || req.path === '/api/realtime',
});

/**
 * Tight limit on credential endpoints to blunt brute force; counts failed attempts only.
 */
export const authFailureLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === 'test' ? 1_000 : 10,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    audit.warn('auth_rate_limited', { scope: 'failures' });
    res.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many failed attempts. Try again in 15 minutes.',
      },
    });
  },
});

/**
 * Counts every auth attempt regardless of outcome - the backstop for endpoints that always answer 200.
 */
export const authTotalLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === 'test' ? 1_000 : 30,
  handler: (_req, res) => {
    audit.warn('auth_rate_limited', { scope: 'total' });
    res.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many requests. Try again in 15 minutes.',
      },
    });
  },
});

/** Protects metered/expensive work (AI calls, uploads). */
export const expensiveLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 1_000 : 20,
});

/** 60 writes per minute per user or IP. */
export const writeLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 1_000 : 60,
});

// --- Validation -------------------------------------------------------------

type Source = 'body' | 'query' | 'params';

/**
 * Validates and REPLACES the request segment, so handlers only see coerced, whitelisted values.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return asyncHandler(async (req, _res, next) => {
    const result = await schema.parseAsync(req[source]);
    // req.query/params are getter-only in Express 5; stash under a symbol key.
    if (source === 'body') {
      req.body = result;
    } else {
      Object.defineProperty(req, `validated${source}`, {
        value: result,
        writable: true,
        configurable: true,
      });
    }
    next();
  });
}

/** Reads a previously validated segment, parsing on demand if `validate()` did not run. */
export const validated = <T extends ZodTypeAny>(req: Request, schema: T, source: Source = 'query') => {
  const key = `validated${source}`;
  const store = (req as any)[key];
  if (store) return store as z.infer<T>;
  return schema.parse(req[source]) as z.infer<T>;
};

export { ZodError };
