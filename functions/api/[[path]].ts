// Cloudflare Pages Functions entry point for the Pulse Market API
// Simple adapter to run Express app on Cloudflare Workers

interface RequestHandler {
  (request: Request, env: any): Promise<Response>;
}

function createRequestHandler(app: any): RequestHandler {
  return async (request: Request, env: any) => {
    // Convert Web Fetch API Request to Express-like request
    const url = new URL(request.url);
    const method = request.method;
    const headers = Object.fromEntries(request.headers.entries());
    
    // Get body
    let body: any = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await request.json();
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          body = Object.fromEntries((await request.formData()).entries());
        } else {
          body = await request.text();
        }
      } catch {
        body = undefined;
      }
    }

    // Create a mock Express request/response
    const req: any = {
      method,
      url: url.pathname + url.search,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers,
      body,
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

    // Call the Express app
    return new Promise<Response>((resolve) => {
      app(req, res, () => {
        // 404 handler
        resolve(new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...resHeaders },
        }));
      });

      // Wait a bit for the async handlers to complete
      setTimeout(() => {
        if (resBody !== null || resStatus !== 200) {
          resolve(new Response(
            typeof resBody === 'string' ? resBody : JSON.stringify(resBody),
            {
              status: resStatus,
              headers: { 'Content-Type': 'application/json', ...resHeaders },
            }
          ));
        }
      }, 100);
    });
  };
}

// Export the handler factory - the actual app will be imported at runtime
export async function onRequest(context: { request: Request; env: any; next: () => Promise<Response> }) {
  // Dynamic import to avoid build-time issues
  const { app } = await import('../../apps/api/src/server');
  const handler = createRequestHandler(app);
  return handler(context.request, context.env);
}