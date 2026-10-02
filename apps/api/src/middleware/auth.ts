import type { NextFunction, Request, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabase, isProd } from '../config.js';
import { AppError, asyncHandler } from './errors.js';
import { audit } from './audit.js';

// Create client defensively
const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('Auth init:', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** The only token accepted without contacting Supabase. See the guard below. */
const TEST_TOKEN = 'test-token';
const testSeamEnabled = env.NODE_ENV === 'test' && !isProd;

const TEST_USER = Object.freeze({
  id: '00000000-0000-4000-8000-000000000000',
  email: 'test@pulse.local',
  user_metadata: { username: 'test_user' },
});

/**
 * Verifies a Supabase access token against the Auth server; the service-role key never leaves the server.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    audit.auth.failure('missing_token', 'bearer');
    throw AppError.unauthorized('Authentication required');
  }

  const token = header.slice(7).trim();
  if (!token || token.length > 4096) {
    audit.auth.failure('malformed_token', 'bearer');
    throw AppError.unauthorized('Invalid token');
  }

  // Test-only seam so the security suite can hit protected routes without live
  // Supabase. Gated on NODE_ENV === 'test' and !isProd - unreachable in deploys.
  if (testSeamEnabled && token === TEST_TOKEN) {
    (req as any).user = TEST_USER;
    return next();
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    audit.auth.failure('invalid_token', 'bearer');
    throw AppError.unauthorized('Invalid or expired session');
  }

  (req as any).user = data.user;
  next();
});

/** Narrow auth check for routes that may be public but behave differently when signed in. */
export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, _res as any, next);
});

export const requireUser = (req: Request) => {
  const user = (req as any).user;
  if (!user) throw AppError.unauthorized();
  return user as { id: string; email: string; user_metadata?: Record<string, unknown> };
};

/**
 * Requires an admin; role comes from `app_metadata` (server-controlled), never `user_metadata`.
 */
export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user) return next(AppError.unauthorized());

  const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.role;
  if (appRole !== 'admin') {
    audit.warn('admin_access_denied', { userId: user.id, path: req.path });
    return next(AppError.forbidden('Admin access required'));
  }

  next();
};
