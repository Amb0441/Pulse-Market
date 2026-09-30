/**
 * Starts the API and the Vite dev server together with prefixed output.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';

const root = import.meta.dirname + '/../..';
const isWindows = process.platform === 'win32';

/** Ports the stack needs; the API port comes from apps/api/.env PORT so it cannot drift. */
const API_PORT = await readApiPort();
const WEB_PORT = 5173;
const HMR_PORT = 24678;

/**
 * Reads PORT from apps/api/.env, defaulting to 3000 when unset.
 */
async function readApiPort(): Promise<number> {
  try {
    const envFile = Bun.file(root + '/apps/api/.env');
    const text = await envFile.text();
    const m = text.match(/^PORT=(\d+)/m);
    return m ? Number(m[1]) : 3000;
  } catch {
    return 3000;
  }
}

function isPortInUse(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (busy: boolean) => {
      socket.destroy();
      resolve(busy);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 1000);
  });
}

const needed: [string, number][] = [
  ['API', API_PORT],
  ['Vite', WEB_PORT],
  ['HMR', HMR_PORT],
];

// Check every needed port up front; otherwise a duplicate run half-starts the stack.
const busy: string[] = [];
for (const [label, port] of needed) {
  if (await isPortInUse(port)) busy.push(`  ${label.padEnd(5)} port ${port}`);
}

if (busy.length) {
  console.error(
    `\nCannot start: these ports are already in use:\n${busy.join('\n')}\n\n` +
      `Most likely another \`bun run dev\` is still running. Stop it, or run:\n` +
      `  taskkill /F /IM bun.exe /FI "WINDOWTITLE eq *bun*"\n` +
      `  taskkill /F /IM node.exe\n\n` +
      `Vite is configured with strictPort, so it will not silently move ports.\n`,
  );
  process.exit(1);
}

interface Service {
  name: string;
  cwd: string;
  cmd: string;
  args: string[];
  color: string;
}

const services: Service[] = [
  {
    name: 'api',
    cwd: root + '/apps/api',
    cmd: 'bun',
    args: ['--watch', 'src/server.ts'],
    color: '\x1b[36m',
  },
  {
    name: 'web',
    cwd: root + '/apps/web',
    cmd: isWindows ? 'bun.exe' : 'bun',
    args: ['run', 'dev:web'],
    color: '\x1b[35m',
  },
];

const RESET = '\x1b[0m';
const children: ChildProcess[] = [];
let shuttingDown = false;

function prefix(name: string, color: string, chunk: Buffer) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
  }
}

for (const svc of services) {
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Both halves read their own .env; NODE_ENV must not be forced to
    // `production` or the API's boot guard rejects dev credentials.
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.stdout?.on('data', (c: Buffer) => prefix(svc.name, svc.color, c));
  child.stderr?.on('data', (c: Buffer) => prefix(svc.name, svc.color, c));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    // One dead half makes the other useless, so stop both.
    process.stdout.write(
      `${svc.color}[${svc.name}]${RESET} exited (code=${code} signal=${signal}); stopping the other process.\n`,
    );
    shutdown(typeof code === 'number' ? code : 1);
  });

  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 150);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));