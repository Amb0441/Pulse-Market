/**
 * Fails the build if a server-side secret can reach the browser: Vite inlines all VITE_* values.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const SECRET_SHAPES: { label: string; re: RegExp }[] = [
  { label: 'database connection string', re: /postgres(?:ql)?:\/\//i },
  { label: 'supabase service_role / secret key', re: /\b(?:sb_secret_|service_role)\b/i },
  { label: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\./ },
  { label: 'google api key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: 'cloudinary secret', re: /\bcloudinary[_-]?secret\b/i },
  { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

function parseEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.js', '.mjs', '.cjs', '.html', '.css'].includes(extname(p))) acc.push(p);
  }
  return acc;
}

const failures: string[] = [];

// 1. VITE_* variables must not contain secret-shaped values.
const frontendEnv = parseEnv('.env');
for (const [key, value] of Object.entries(frontendEnv)) {
  if (!key.startsWith('VITE_') || !value) continue;
  for (const { label, re } of SECRET_SHAPES) {
    if (re.test(value)) failures.push(`VITE_ variable ${key} looks like a ${label} and would be inlined into the browser bundle`);
  }
}

// 2. Real backend secrets must not appear in the built bundle.
if (existsSync('dist')) {
  const backendEnv = parseEnv('backend/.env');
  const sensitive = ['SUPABASE_SERVICE_ROLE_KEY', 'CLOUDINARY_API_SECRET', 'SUPABASE_ANON_KEY']
    .map((k) => [k, backendEnv[k]] as const)
    .filter(([, v]) => v && !v.startsWith('your_'));

  for (const file of walk('dist')) {
    const contents = readFileSync(file, 'utf8');
    for (const [name, secret] of sensitive) {
      if (contents.includes(secret)) failures.push(`${name} from backend/.env appears in ${file}`);
    }
    for (const { label, re } of SECRET_SHAPES) {
      if (re.test(contents)) failures.push(`${file} contains a ${label}`);
    }
  }
} else {
  failures.push('dist/ not found - run the build before scanning');
}

if (failures.length) {
  console.error('SECRET SCAN FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('Secret scan passed: no server-side secrets in the client bundle.');
