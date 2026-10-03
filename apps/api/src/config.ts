import { z } from 'zod';

const PLACEHOLDERS = [
  '',
  'your_supabase_project_url',
  'your_supabase_anon_key',
  'your_service_role_key',
  'your_cloud_name',
  'your_api_key',
  'your_api_secret',
];

const isPlaceholder = (value: string | undefined) =>
  !value || PLACEHOLDERS.includes(value.trim().toLowerCase());

const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: boolish,
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Public site origin, used for canonical URLs in legal pages and the sitemap.
  APP_URL: z.string().default('http://localhost:5173'),
  // When true, any https://*.pages.dev origin may call the API. For a Pages +
  // Render showcase so preview URLs work without listing every hash. Leave
  // false on a locked-down VPS.
  ALLOW_CLOUDFLARE_PAGES: boolish,
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info']).default('info'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(25).default(5),
  // Operator identity for the legal pages; CONTACT_EMAIL is required in production.
  CONTACT_EMAIL: z.string().optional(),
  LEGAL_ENTITY_NAME: z.string().optional(),
  GOVERNING_LAW: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}

export const env = load();

export const isProd = env.NODE_ENV === 'production';

export const hasSupabase =
  !isPlaceholder(env.SUPABASE_URL) && !isPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY);
export const hasCloudinary =
  !isPlaceholder(env.CLOUDINARY_CLOUD_NAME) &&
  !isPlaceholder(env.CLOUDINARY_API_KEY) &&
  !isPlaceholder(env.CLOUDINARY_API_SECRET);

const MISSING_MESSAGE =
  'Missing required credentials. See apps/api/.env.example for the full list.';

const problems: string[] = [];

if (!hasSupabase) {
  problems.push('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required (auth and data)');
}

if (isProd && !hasCloudinary) {
  // Local dev can run without image storage; production must not, or uploads are dropped silently.
  problems.push('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET are required in production');
}

if (isProd && isPlaceholder(env.CONTACT_EMAIL)) {
  problems.push('CONTACT_EMAIL is required in production (the legal pages must name a reachable contact)');
}

// Tests boot the app with placeholders; every other environment must fail closed.
if (problems.length) {
  const message = `${MISSING_MESSAGE}\n${problems.map((p) => `  - ${p}`).join('\n')}`;
  if (env.NODE_ENV === 'test') {
    console.warn(message);
  } else {
    throw new Error(message);
  }
}

/** Origins allowed to call the API. Never a wildcard when credentials are involved. */
export const allowedOrigins = env.FRONTEND_URL.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const maxUploadBytes = env.MAX_UPLOAD_MB * 1024 * 1024;

/** Operator identity used by the legal pages so they never ship blank. */
export const legal = {
  contactEmail: env.CONTACT_EMAIL || 'support@pulse.market',
  entityName: env.LEGAL_ENTITY_NAME || 'Pulse Market',
  governingLaw: env.GOVERNING_LAW || 'the jurisdiction where the operator is established',
  appUrl: env.APP_URL.replace(/\/$/, ''),
};
