// Cloudflare Pages Functions entry point for Express backend
// Uses nodejs_compat (set in wrangler.json) to support Node.js built-ins

import { createApp } from '../../apps/api/src/server';

let appPromise: Promise<any> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

async function handleRequest(request: Request, env: any): Promise<Response> {
  const app = await getApp();
  const url = new URL(request.url);

  // Convert Web Fetch Request to Express-like request
  const method = request.method;
  const headers = Object.fromEntries(request.headers.entries());
  const body = method !== 'GET' && method !== 'HEAD'
    ? await request.text().catch(() => '')
    : undefined;

  // Create mock Express request/response objects
  const req: any = {
    method,
    url: url.pathname + url.search,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers,
    body: body ? JSON.parse(body) : undefined,
    params: {},
    ip: request.headers.get('cf-connecting-ip') || 'unknown',
    get: (name: string) => headers[name.toLowerCase()],
  };

  let resStatus = 200;
  const resHeaders: Record<string, string> = {};
  let resBody: any = null;

  const res: any = {
    status(code: number) {
      resStatus = code;
      return res;
    },
    setHeader(name: string, value: string) {
      resHeaders[name] = value;
      return res;
    },
    json(data: any) {
      resBody = data;
      resHeaders['content-type'] = 'application/json';
      return res;
    },
    send(data: any) {
      resBody = data;
      return res;
    },
    end(data?: any) {
      if (data !== undefined) resBody = data;
      return res;
    },
    getHeader: (name: string) => resHeaders[name],
  };

  // Call Express app
  await new Promise<void>((resolve) => {
    app(req, res, () => {
      // 404
      resStatus = 404;
      resBody = { error: 'Not found' };
      resolve();
    });

    // Give async handlers time to run
    setTimeout(resolve, 100);
  });

  return new Response(
    typeof resBody === 'string' ? resBody : JSON.stringify(resBody),
    {
      status: resStatus,
      headers: { 'Content-Type': 'application/json', ...resHeaders },
    }
  );
}

export async function onRequest(context: { request: Request; env: any }): Promise<Response> {
  return handleRequest(context.request, context.env);
}