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

export default defineConfig(() => {
  const isDocker = process.env.DOCKER === 'true';
  // Inside Docker the API is reachable by service name; on the host that name
  // does not resolve, so the same proxy target silently broke every /api call
  // for anyone running `bun run dev` outside a container.
  const apiTarget = process.env.API_PROXY_TARGET ?? (isDocker ? 'http://backend:3000' : 'http://localhost:3000');
  return {
    plugins: [react(), tailwindcss(), swVersion()],
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
      // Without this Vite silently moves to 5174 when 5173 is busy, and the API's
      // origin allowlist does not know that port, so every request fails with a
      // 403 CORS_DENIED that looks like a server misconfiguration. Failing loudly
      // is far easier to diagnose than being moved somewhere unexpected.
      strictPort: true,
      // 3000 is the API's port (backend/.env PORT). HMR was pinned there too, so
      // Vite's websocket server took the port, the backend never bound, and every
      // request to http://localhost:3000 hit HMR instead of the API - surfacing
      // as CORS errors and 426/503 responses. HMR must stay off the API port.
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
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
