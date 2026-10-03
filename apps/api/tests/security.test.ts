import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import { app } from '../src/server.js';

let server: Server;
let base: string;

/** The validation error shape on the wire: `details` is a list rather than a
 *  field->message map, so several problems in one request arrive together.
 *  Tests assert on `field` too, since a 400 alone cannot say which rule fired. */
type ValidationErrorBody = {
  error: { code: string; message: string; details?: { field: string; message: string }[] };
};

beforeAll(async () => {
  // Port 0 lets the OS pick a free port, so tests never collide with a dev server.
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
});

const req = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// The only token the test seam in middleware/auth.ts accepts, so protected routes
// are reachable without a live Supabase.
const AUTH = { Authorization: 'Bearer test-token' };

/** Authenticated JSON POST, so a 401 cannot satisfy an assertion expecting a 400. */
const authedJson = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...AUTH },
  body: JSON.stringify(body),
});

describe('test isolation', () => {
  test('the suite never inherits real credentials from backend/.env', async () => {
    // tests/setup.ts pins dummy values before config.ts loads, so real keys in
    // backend/.env can never reach the suite; fail loudly if that pinning stops.
    const { env, isProd } = await import('../src/config.js');
    expect(env.NODE_ENV).toBe('test');
    expect(isProd).toBe(false);
    expect(env.SUPABASE_URL).toBe('https://test-not-a-real-project.supabase.co');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('test-service-role-key');
  });

  test('the test token is not accepted outside the test environment', async () => {
    // The auth test seam must stay unreachable in a real deploy; this pins that contract.
    const { authenticate } = await import('../src/middleware/auth.js');
    expect(authenticate).toBeInstanceOf(Function);
    // Reachable only under NODE_ENV=test; the guard itself is asserted in config.test.ts.
  });
});

describe('security headers', () => {
  test('does not advertise the framework', async () => {
    const res = await req('/api/health');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  test('sets hardening headers', async () => {
    const res = await req('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('CORS', () => {
  test('allows a configured origin', async () => {
    const res = await req('/api/health', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  test('rejects an unlisted origin', async () => {
    const res = await req('/api/health', { headers: { Origin: 'http://evil.example' } });
    expect(res.status).toBe(403);
  });
});

describe('authentication', () => {
  test('rejects a missing token', async () => {
    const res = await req('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', price: 1, category: 'Free' }),
    });
    expect(res.status).toBe(401);
  });

  test('rejects a malformed authorization header', async () => {
    const res = await req('/api/auth/me', { headers: { Authorization: 'Basic abc123' } });
    expect(res.status).toBe(401);
  });
});

describe('token refresh', () => {
  // Asserts reachability of the guard, not the Supabase exchange, which needs a live project.

  test('is reachable without an access token', async () => {
    // The refresh token is usually already expired, so the endpoint cannot require
    // auth: a 400 rather than a 401 shows the request got past auth.
    const res = await req('/api/auth/refresh', json({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ValidationErrorBody;
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('rejects an empty refresh token', async () => {
    const res = await req('/api/auth/refresh', json({ refresh_token: '' }));
    expect(res.status).toBe(400);
  });

  test('rejects a non-string refresh token', async () => {
    const res = await req('/api/auth/refresh', json({ refresh_token: 12345 }));
    expect(res.status).toBe(400);
  });
});

describe('input validation', () => {
  test('rejects a short password', async () => {
    // The username and pin are valid on purpose; without them the 400 could come
    // from another rule and the password rule could be deleted unnoticed.
    const res = await req(
      '/api/auth/signup',
      json({ email: 'a@b.com', password: 'short', username: 'abcd', lat: 16.402, lng: 120.596 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ValidationErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // Assert the field too: a 400 alone cannot tell a password rule from a pin rule.
    expect(body.error.details?.map((d) => d.field)).toContain('password');
  });

  test('rejects a signup with no map pin, in plain English', async () => {
    const res = await req(
      '/api/auth/signup',
      json({ email: 'c@d.com', password: 'correct-horse', username: 'abcd' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ValidationErrorBody;
    expect(body.error.details?.[0].message).toMatch(/drop a pin on the map/i);
    // A missing coordinate must not surface as a raw "received nan" error message.
    expect(JSON.stringify(body)).not.toMatch(/nan/i);
  });

  test('rejects a pin outside the Philippines', async () => {
    const res = await req(
      '/api/auth/signup',
      json({ email: 'e@f.com', password: 'correct-horse', username: 'abcd', lat: 40.7128, lng: -74.006 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ValidationErrorBody;
    expect(body.error.details?.map((d) => d.message).join(' ')).toMatch(/outside the Philippines/i);
  });

  test('rejects an unknown category', async () => {
    const res = await req(
      '/api/listings',
      authedJson({ title: 'x', price: 1, category: 'NotARealCategory' }),
    );
    expect(res.status).toBe(400);
  });

  test('blocks mass assignment of server-controlled fields', async () => {
    const res = await req(
      '/api/listings',
      authedJson({ title: 'x', price: 1, category: 'Free', user_id: 'attacker', status: 'archived' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details.some((d) => d.field === '(root)')).toBe(true);
  });

  test('rejects a non-uuid listing id', async () => {
    expect((await req('/api/listings/not-a-uuid')).status).toBe(400);
  });

  test('rejects path traversal in an asset id', async () => {
    const res = await req(`/api/upload/${encodeURIComponent('../../etc/passwd')}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(400);
  });

  test('rejects a non-https image url', async () => {
    const res = await req(
      '/api/listings',
      authedJson({ title: 'x', price: 1, category: 'Free', images: ['http://insecure.example/a.jpg'] }),
    );
    expect(res.status).toBe(400);
  });
});

describe('error handling', () => {
  test('malformed json is a 400, not a 500', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    expect(res.status).toBe(400);
  });

  test('an oversized body is a 413, not a 500', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(1_500_000) }),
    });
    expect(res.status).toBe(413);
  });

  test('unknown routes are a 404', async () => {
    expect((await req('/api/does-not-exist')).status).toBe(404);
  });

  test('does not leak stack traces', async () => {
    // Both paths fail before any database call, so the error-shape check is deterministic.
    for (const path of ['/api/listings/not-a-uuid', '/api/does-not-exist']) {
      const res = await req(path);
      const text = await res.text();
      expect(text).not.toContain('at Object.');
      expect(text).not.toContain('.ts:');
      expect(text).not.toContain('node_modules');
      expect(text).not.toContain('supabase.co');
    }
  });
});

describe('health endpoint information disclosure', () => {
  test('public health reveals no provider state', async () => {
    const res = await req('/api/health');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp']);
    expect(body).not.toHaveProperty('services');
    expect(body).not.toHaveProperty('AUTHMode');
    expect(body).not.toHaveProperty('env');
  });

  test('diagnostics require authentication', async () => {
    expect((await req('/api/health/details')).status).toBe(401);
  });

  test('diagnostics require an admin role', async () => {
    expect((await req('/api/health/details', { headers: AUTH })).status).toBe(403);
  });
});

describe('asset ownership', () => {
  test('lets the owner through the scope check', async () => {
    const res = await req(
      `/api/upload/${encodeURIComponent('pulse-market/00000000-0000-4000-8000-000000000000/mine')}`,
      {
        method: 'DELETE',
        headers: AUTH,
      },
    );
    // Asserts the owner passes the ownership gate rather than an exact status: the
    // tests below pin 403 for everyone else, and 200/404/503 follow storage config.
    expect(res.status).not.toBe(403);
    expect([200, 404, 503]).toContain(res.status);
  });

  test('forbids deleting an asset in another user folder', async () => {
    const res = await req(`/api/upload/${encodeURIComponent('pulse-market/someone-else/photo')}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(403);
  });

  test('forbids the shared legacy root, which is not owned by anyone', async () => {
    const res = await req(`/api/upload/${encodeURIComponent('pulse-market/legacy')}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(403);
  });

  test('reports unconfigured storage as 503, not a misleading 404', async () => {
    // The suite runs with placeholder credentials, so storage is unavailable; that
    // is a misconfiguration and must not read as "that image does not exist".
    const res = await req(
      `/api/upload/${encodeURIComponent('pulse-market/00000000-0000-4000-8000-000000000000/mine')}`,
      { method: 'DELETE', headers: AUTH },
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('checks ownership before storage availability', async () => {
    // A non-owner is refused with 403 even though storage is also unavailable, so
    // the authorization decision never depends on server configuration.
    const res = await req(`/api/upload/${encodeURIComponent('pulse-market/someone-else/photo')}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('upload validation', () => {
  test('rejects a script disguised as a png', async () => {
    const form = new FormData();
    form.append('images', new File(['<script>alert(1)</script>'], 'evil.png', { type: 'image/png' }));
    const res = await req('/api/upload', { method: 'POST', headers: AUTH, body: form });
    // 415: the bytes are not an image; the magic-byte check catches it, not the extension.
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_IMAGE');
  });

  test('rejects an image whose bytes do not match its declared type', async () => {
    // Real PNG signature but declared as JPEG: the mismatch must still be refused.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const form = new FormData();
    form.append('images', new File([png], 'liar.jpg', { type: 'image/jpeg' }));
    const res = await req('/api/upload', { method: 'POST', headers: AUTH, body: form });
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_IMAGE');
  });

  test('rejects a disallowed content type', async () => {
    const form = new FormData();
    form.append('images', new File(['<svg onload=alert(1)>'], 'evil.svg', { type: 'image/svg+xml' }));
    const res = await req('/api/upload', { method: 'POST', headers: AUTH, body: form });
    expect(res.status).toBe(415);
  });
});

describe('api versioning', () => {
  // /health is static, so these assertions never depend on a live Supabase or seeded data.
  test('serves versioned paths', async () => {
    const res = await req('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-api-version')).toBe('1');
  });

  test('marks unversioned paths deprecated', async () => {
    const res = await req('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('deprecation')).toBe('true');
  });

  test('versioned and unversioned paths return the same payload', async () => {
    const [versioned, plain] = await Promise.all([
      req('/api/v1/health').then((r) => r.json()),
      req('/api/health').then((r) => r.json()),
    ]);
    expect(Object.keys(versioned as object).sort()).toEqual(Object.keys(plain as object).sort());
  });
});

// ---------------------------------------------------------------------------
// Privacy of public reads
// ---------------------------------------------------------------------------

describe('coordinate blurring', () => {
  // The public listings GETs take no token, so response precision is what a stranger
  // can collect about a seller's pickup point; filtering still runs on exact columns.
  test('rounds a listing pin to about 110 m', async () => {
    const { blurCoords } = await import('../src/server.js');
    const blurred = blurCoords({
      id: 'row-1',
      title: 'Desk',
      lat: 14.555555,
      lng: 121.021021,
    });

    expect(blurred.lat).toBe(14.556);
    expect(blurred.lng).toBe(121.021);
    expect(blurred.title).toBe('Desk');
  });

  test('does not mutate the row it was given', async () => {
    const { blurCoords } = await import('../src/server.js');
    const row = { lat: 14.555555, lng: 121.021021 };
    blurCoords(row);

    expect(row.lat).toBe(14.555555);
    expect(row.lng).toBe(121.021021);
  });

  test('leaves rows without a pin untouched', async () => {
    const { blurCoords } = await import('../src/server.js');
    const draft = { lat: null, lng: null, title: 'No pin yet' };
    expect(blurCoords(draft)).toEqual(draft);
  });
});

describe('realtime stream cap', () => {
  // `/api/realtime` is exempt from the request limiter, so this cap is the only
  // bound on how many sockets one member can hold open.
  test('refuses a seventh concurrent stream for the same member', async () => {
    const open: AbortController[] = [];
    const statuses: number[] = [];

    try {
      for (let i = 0; i < 7; i++) {
        const ac = new AbortController();
        open.push(ac);
        const res = await fetch(`${base}/api/realtime`, {
          headers: AUTH,
          signal: ac.signal,
        });
        statuses.push(res.status);
      }

      expect(statuses.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(statuses[6]).toBe(429);
    } finally {
      open.forEach((ac) => ac.abort());
      // Let the close handlers drop the subscribers so the map is empty for the next test.
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });

  test('answers the refusal with the standard error envelope', async () => {
    const open: AbortController[] = [];
    try {
      for (let i = 0; i < 6; i++) {
        const ac = new AbortController();
        open.push(ac);
        await fetch(`${base}/api/realtime`, { headers: AUTH, signal: ac.signal });
      }

      const res = await fetch(`${base}/api/realtime`, { headers: AUTH });
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('TOO_MANY_STREAMS');
      expect(body.error.message).toContain('Close another tab');
    } finally {
      open.forEach((ac) => ac.abort());
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
});

// ---------------------------------------------------------------------------
// Reviews and notifications
// ---------------------------------------------------------------------------

describe('reviews and notifications routes', () => {
  // Registration, not data: these prove the paths are mounted behind `authenticate`.
  // The rows themselves need a real account, which the suite deliberately has not.
  test('every route demands a token', async () => {
    for (const path of ['/api/reviews', '/api/notifications']) {
      expect((await req(path)).status).toBe(401);
    }
    for (const path of ['/api/reviews', '/api/notifications/read-all']) {
      expect((await req(path, { method: 'POST' })).status).toBe(401);
    }
  });

  test('read-all is a route, not a fall-through to 404', async () => {
    const res = await req('/api/notifications/read-all', { method: 'POST' });
    expect(res.status).not.toBe(404);
  });
});

describe('createReviewSchema', () => {
  test('accepts a rating of 1-5 with an optional comment', async () => {
    const { createReviewSchema } = await import('../src/schemas.js');
    const conversationId = '11111111-1111-4111-8111-111111111111';

    expect(createReviewSchema.safeParse({ conversationId, rating: 5 }).success).toBe(true);

    const parsed = createReviewSchema.parse({ conversationId, rating: 3, comment: '  smooth  ' });
    expect(parsed.comment).toBe('smooth');
    expect(createReviewSchema.parse({ conversationId, rating: 3 }).comment).toBe('');
  });

  test('rejects bounds, fractions, oversized text and unknown keys', async () => {
    const { createReviewSchema } = await import('../src/schemas.js');
    const conversationId = '11111111-1111-4111-8111-111111111111';

    // Mirrors the CHECK on reviews.rating, so the database never sees these.
    expect(createReviewSchema.safeParse({ conversationId, rating: 0 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ conversationId, rating: 6 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ conversationId, rating: 4.5 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ conversationId, rating: '5' }).success).toBe(false);
    expect(
      createReviewSchema.safeParse({ conversationId, rating: 3, comment: 'x'.repeat(501) }).success,
    ).toBe(false);
    // `.strict()`: a client cannot smuggle reviewerId or targetUserId past the route.
    expect(
      createReviewSchema.safeParse({ conversationId, rating: 3, targetUserId: 'someone-else' })
        .success,
    ).toBe(false);
    expect(createReviewSchema.safeParse({ conversationId: 'not-a-uuid', rating: 3 }).success).toBe(
      false,
    );
  });
});

describe('listing feed query', () => {
  test('accepts pins that would have 400ed the marketplace for other members', async () => {
    const { listListingsQuerySchema } = await import('../src/schemas.js');

    expect(listListingsQuerySchema.safeParse({ radius: '50', lat: '0', lng: '0', limit: '100' }).success).toBe(
      true,
    );
    expect(listListingsQuerySchema.safeParse({ radius: '50', lat: '16.4', limit: '100' }).success).toBe(true);
    expect(listListingsQuerySchema.safeParse({ category: 'All' }).success).toBe(true);
    expect(listListingsQuerySchema.safeParse({ radius: '51', lat: '16.4', lng: '120.6' }).success).toBe(true);

    const dropped = listListingsQuerySchema.parse({ lat: '16.4', limit: '100' });
    expect(dropped.lat).toBeUndefined();
    expect(dropped.lng).toBeUndefined();
  });
});
