/** Fetches the live schema from PostgREST's OpenAPI document - the real database
 * shape, which can drift from supabase-schema.sql in the repo. */
import { env } from '../src/config.js';

const res = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});
if (!res.ok) {
  console.log('could not fetch OpenAPI doc:', res.status, await res.text());
  process.exit(1);
}

const spec = (await res.json()) as {
  definitions?: Record<string, { required?: string[]; properties: Record<string, { type?: string; format?: string; default?: unknown }> }>;
};

for (const [name, def] of Object.entries(spec.definitions ?? {})) {
  const required = new Set(def.required ?? []);
  const cols = Object.entries(def.properties).map(([col, s]) => {
    const t = [s.type, s.format].filter(Boolean).join('/');
    const d = s.default !== undefined ? ` default=${JSON.stringify(s.default)}` : '';
    return `${col}: ${t}${required.has(col) ? ' NOT NULL' : ' nullable'}${d}`;
  });
  console.log(`\n=== ${name} ===`);
  cols.forEach((c) => console.log('  ' + c));
}
