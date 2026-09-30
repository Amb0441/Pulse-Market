import { env, isProd } from '../config.js';

/**
 * Critical-events-only logger: auth outcomes, data mutations, security events.
 * Single-line JSON, scrubbed of tokens, passwords, secrets, and request bodies.
 */

type Level = 'error' | 'warn' | 'info';

const REDACTED = '[redacted]';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'api_secret',
  'cookie',
  'service_role_key',
]);

export function scrub(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(scrub);
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrub(value);
    }
    return out;
  }
  if (typeof input === 'string' && /bearer\s+[\w.-]+/i.test(input)) {
    return input.replace(/bearer\s+[\w.-]+/i, 'Bearer [redacted]');
  }
  return input;
}

function emit(level: Level, event: string, context: Record<string, unknown> = {}) {
  if (env.LOG_LEVEL === 'silent') return;
  if (level === 'info' && env.LOG_LEVEL === 'error') return;
  if (level === 'warn' && env.LOG_LEVEL === 'error') return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(scrub(context) as Record<string, unknown>),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const audit = {
  info: (event: string, context?: Record<string, unknown>) => emit('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => emit('error', event, context),
  auth: {
    success: (userId: string, method: string) =>
      emit('info', 'auth_success', { userId, method, prod: isProd }),
    failure: (reason: string, method: string, meta?: Record<string, unknown>) =>
      emit('warn', 'auth_failure', { reason, method, ...meta }),
  },
};
