import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import {defineConfig, type Plugin} from 'vite';

// package.json is the single source of truth for the app version. Bumping it
// is the only step needed to cut a release: the number flows into the JS
// bundle, the service worker cache name and the on-screen version, so they
// cannot drift apart.
const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8'));
const version: string = pkg.version;

if (!/^\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`package.json version "${version}" is not a valid semver string`);
}

/**
 * Vite copies files in public/ verbatim, so the service worker never goes
 * through the transform pipeline and cannot see `define`. This rewrites the
 * __APP_VERSION__ placeholder in the emitted file instead.
 *
 * The substituted value is `version` plus a fingerprint derived from the hashed
 * asset filenames this build produced. Using the version alone was not enough:
 * the version only changes when someone remembers to bump it, so every rebuild
 * that did not bumped it reused the same CACHE_NAME, `activate` deleted nothing,
 * and browsers stayed pinned to the first build they ever cached. The
 * fingerprint changes whenever any content changes, so a new build always
 * invalidates the old cache.
 */
function swVersion(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const swPath = path.join(distDir, 'sw.js');
      if (!existsSync(swPath)) {
        this.warn('dist/sw.js not found; skipped service worker version stamping');
        return;
      }

      const assetsDir = path.join(distDir, 'assets');
      const assets = existsSync(assetsDir)
        ? readdirSync(assetsDir).filter((f) => !f.endsWith('.map')).sort()
        : [];

      // Cheap, stable fingerprint of the built output.
      let hash = 0;
      for (const name of assets) {
        for (let i = 0; i < name.length; i++) {
          hash = (Math.imul(hash, 31) + name.charCodeAt(i)) >>> 0;
        }
      }

      const buildId = `${version}-${hash.toString(36)}`;
      const source = readFileSync(swPath, 'utf8');
      if (!source.includes('__APP_VERSION__')) {
        this.warn('dist/sw.js has no __APP_VERSION__ placeholder; nothing stamped');
        return;
      }
      writeFileSync(swPath, source.replaceAll('__APP_VERSION__', buildId));
      this.info?.(`service worker cache name: pulse-market-${buildId}`);
    },
  };
}

/**
 * Public API origin from VITE_API_URL. Empty in local dev (Vite proxies /api).
 * Rejects anything that is not an http(s) origin so a secret cannot be inlined
 * into CSP or the bundle via this slot.
 */
function publicApiOrigin(): string {
  const raw = (process.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/service_role|sb_secret_|eyJ[A-Za-z0-9_-]{10,}\./.test(raw)) {
    throw new Error('VITE_API_URL looks like a credential. Use an https origin only, never a key.');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('VITE_API_URL must be an absolute origin, e.g. https://api.example.com');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_API_URL must be http or https');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an origin with no path, query, or hash');
  }
  if (url.username || url.password) {
    throw new Error('VITE_API_URL must not include credentials');
  }
  return `${url.protocol}//${url.host}`;
}

function applyCspApiOrigin(source: string, origin: string): string {
  const extra = origin ? `${origin} ` : '';
  if (!source.includes('__CSP_API_ORIGIN__')) return source;
  return source.replaceAll('__CSP_API_ORIGIN__', extra);
}

/** Stamps the public API origin into CSP in index.html and dist/_headers. */
function cspApiOrigin(): Plugin {
  return {
    name: 'csp-api-origin',
    transformIndexHtml(html) {
      return applyCspApiOrigin(html, publicApiOrigin());
    },
    closeBundle() {
      const headersPath = path.resolve(import.meta.dirname, 'dist', '_headers');
      if (!existsSync(headersPath)) return;
      const origin = publicApiOrigin();
      const next = applyCspApiOrigin(readFileSync(headersPath, 'utf8'), origin);
      writeFileSync(headersPath, next);
      if (origin) this.info?.(`CSP connect-src includes ${origin}`);
    },
  };
}

export default defineConfig(() => {
  const isDocker = process.env.DOCKER === 'true';
  return {
    plugins: [react(), tailwindcss(), swVersion(), cspApiOrigin()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Without this Vite silently moves to 5174 when 5173 is busy. Failing loudly
      // is easier to diagnose than being moved somewhere unexpected.
      strictPort: true,
      // HMR is pinned off 3000 deliberately. That is the API's port, and Vite's
      // websocket server taking it made requests meant for the backend hit HMR
      // instead and surface as CORS errors.
      //
      // Do not set `host` here: Vite uses it as the *bind* address too, so
      // `localhost` made the ws server listen on ::1 only, which Docker's port
      // publish cannot reach (browser saw "WebSocket closed without opened").
      // Omitted, it binds every interface and the client keeps using the page's
      // own hostname (localhost).
      hmr: process.env.DISABLE_HMR !== 'true' ? {
        port: 24678,
      } : false,
      watch: isDocker ? {
        usePolling: true,
        interval: 1000,
      } : (process.env.DISABLE_HMR === 'true' ? null : {}),
      // Leave VITE_API_URL empty in local .env so the browser calls same-origin
      // /api. This proxy forwards to the Express API. Timeouts are 0 so the
      // SSE stream on /api/realtime is not cut off.
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
  };
});
