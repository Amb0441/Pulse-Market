import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** config.ts resolves from process.env at import time, so these assertions run the
 * real module in a subprocess rather than re-implementing its logic; that also
 * proves the process actually refuses to boot. */
async function probe(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-cfg-'));
  const script = join(dir, 'probe.ts');
  await Bun.write(
    script,
    `const c = await import(${JSON.stringify(join(ROOT, 'src/config.ts'))});
     console.log(JSON.stringify({ hasSupabase: c.hasSupabase, hasCloudinary: c.hasCloudinary,
       legal: c.legal, allowedOrigins: c.allowedOrigins, isProd: c.isProd }));`,
  );

  const proc = Bun.spawn(['bun', 'run', script], {
    // Run from the temp dir: Bun auto-loads a `.env` from the cwd, so running from
    // the repo root would merge the developer's real credentials into the probe.
    cwd: dir,
    // No PATH-merged ambient environment either: start from nothing.
    env: { ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, code };
}

// A syntactically valid but unroutable hostname, never contacted: these tests only
// check that config parsing accepts or rejects values.
const REAL_URL = 'https://project.invalid';
const REAL_SECRET = 'a-real-looking-service-role-key';
const ok = { SUPABASE_URL: REAL_URL, SUPABASE_SERVICE_ROLE_KEY: REAL_SECRET };

function parse(stdout: string) {
  return JSON.parse(stdout.trim().split('\n').at(-1) as string);
}

describe('config: no demo mode remains', () => {
  test('missing supabase refuses to boot, even in development', async () => {
    // Missing a provider is a hard boot failure, not a silent fallback to fixtures.
    const { stderr, code } = await probe({
      NODE_ENV: 'development',
      SUPABASE_URL: 'your_supabase_project_url',
      SUPABASE_SERVICE_ROLE_KEY: 'your_service_role_key',
    });
    expect(code).not.toBe(0);
    expect(stderr).toContain('SUPABASE_URL');
  });

  test('a url without a service_role key also refuses to boot', async () => {
    const { code } = await probe({
      NODE_ENV: 'development',
      SUPABASE_URL: REAL_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'your_service_role_key',
    });
    expect(code).not.toBe(0);
  });

  test('gemini is no longer a recognised variable', async () => {
    const { code } = await probe({
      NODE_ENV: 'development',
      ...ok,
      // Must not be required, and must not reintroduce demo behaviour.
      GEMINI_API_KEY: 'irrelevant-key',
    });
    expect(code).toBe(0);
  });
});

describe('config: valid development environment', () => {
  test('boots and reports providers', async () => {
    const { stdout, code } = await probe({ NODE_ENV: 'development', ...ok });
    expect(code).toBe(0);
    const flags = parse(stdout);
    expect(flags.hasSupabase).toBe(true);
    expect(flags.hasCloudinary).toBe(false);
    expect(flags.isProd).toBe(false);
  });
});

describe('config: production requirements', () => {
  test('fails to boot without cloudinary', async () => {
    const { stderr, code } = await probe({
      NODE_ENV: 'production',
      ...ok,
      CLOUDINARY_CLOUD_NAME: 'your_cloud_name',
      CLOUDINARY_API_KEY: 'your_api_key',
      CLOUDINARY_API_SECRET: 'your_api_secret',
    });
    expect(code).not.toBe(0);
    expect(stderr).toContain('CLOUDINARY_API_SECRET');
  });

  test('fails to boot without a contact address for the legal pages', async () => {
    // CONTACT_EMAIL is required so the production legal pages name someone.
    const { stderr, code } = await probe({
      NODE_ENV: 'production',
      ...ok,
      CLOUDINARY_CLOUD_NAME: 'c',
      CLOUDINARY_API_KEY: 'k',
      CLOUDINARY_API_SECRET: 's',
    });
    expect(code).not.toBe(0);
    expect(stderr).toContain('CONTACT_EMAIL');
  });

  test('boots when production requirements are met', async () => {
    const { stdout, code } = await probe({
      NODE_ENV: 'production',
      ...ok,
      CLOUDINARY_CLOUD_NAME: 'c',
      CLOUDINARY_API_KEY: 'k',
      CLOUDINARY_API_SECRET: 's',
      CONTACT_EMAIL: 'legal@pulse.market',
    });
    expect(code).toBe(0);
    const flags = parse(stdout);
    expect(flags.isProd).toBe(true);
    expect(flags.legal.contactEmail).toBe('legal@pulse.market');
  });
});

describe('config: legal defaults never ship blank', () => {
  test('falls back to readable defaults rather than empty strings', async () => {
    const { stdout, code } = await probe({ NODE_ENV: 'development', ...ok });
    expect(code).toBe(0);
    const { legal } = parse(stdout);
    expect(legal.contactEmail.length).toBeGreaterThan(0);
    expect(legal.entityName.length).toBeGreaterThan(0);
    expect(legal.governingLaw.length).toBeGreaterThan(0);
  });
});

describe('config: CORS allowlist', () => {
  test('parses multiple origins', async () => {
    const { stdout, code } = await probe({
      NODE_ENV: 'development',
      ...ok,
      FRONTEND_URL: 'http://localhost:5173, https://pulse.example',
    });
    expect(code).toBe(0);
    expect(parse(stdout).allowedOrigins).toEqual(['http://localhost:5173', 'https://pulse.example']);
  });

  test('ignores empty entries', async () => {
    const { stdout } = await probe({
      NODE_ENV: 'development',
      ...ok,
      FRONTEND_URL: 'http://localhost:5173, ,https://pulse.example',
    });
    expect(parse(stdout).allowedOrigins).toEqual(['http://localhost:5173', 'https://pulse.example']);
  });
});
