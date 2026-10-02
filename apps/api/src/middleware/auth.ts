import type { NextFunction, Request, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError, asyncHandler } from './errors.js';
import { audit } from './audit.js';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    _supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch (e) {
    _supabase = {} as SupabaseClient;
  }
  return _supabase;
}

export const supabase = getSupabase();

const TEST_TOKEN = 'test-token';
const testSeamEnabled = process.env.NODE_ENV === 'test';

const TEST_USER = Object.freeze({
  id: '00000000-0000-4000-8000-000000000000',
  email: 'test@pulse.local',
  user_metadata: { username: 'test_user' },
});

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

  if (testSeamEnabled && token === TEST_TOKEN) {
    (req as any).user = TEST_USER;
    return next();
  }

  const { data, error } = await getSupabase().auth.getUser(token);

  if (error || !data.user) {
    audit.auth.failure('invalid_token', 'bearer');
    throw AppError.unauthorized('Invalid or expired session');
  }

  (req as any).user = data.user;
  next();
});

export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, _res as any, next);
});

export const requireUser = (req: Request) => {
  const user = (req as any).user;
  if (!user) throw AppError.unauthorized();
  return user as { id: string; email: string; user_metadata?: Record<string, unknown> };
};

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
