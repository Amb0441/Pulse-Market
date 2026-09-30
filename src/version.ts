/** App version injected from package.json via vite.config.ts `define`; do not hardcode a copy here. */
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
