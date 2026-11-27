import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { loadConfig, type Config } from './config';
import { handleHealth } from './routes/health';
import { isPageRoute, servePage, serveStatic } from './routes/pages';
import { applyHeaders, clientIp, RateLimiter, securityHeaders } from './security';
import { proxyToBackend } from './services/api-client';

function notFound(res: import('node:http').ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

export function createApp(config: Config): Server {
  const headers = securityHeaders(config.s3UploadOrigin);
  const limiter = new RateLimiter(config.rateLimitPerMinute);

  return createServer(async (req, res) => {
    applyHeaders(res, headers);
    const { pathname } = new URL(req.url ?? '/', 'http://site');
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && pathname === '/health') return handleHealth(req, res);

      // API calls go to the back end. Predictions cost money, so they are rate limited.
      if (pathname.startsWith('/api/') || pathname.startsWith('/mock-s3/')) {
        if (method === 'POST' && pathname === '/api/predictions' && !limiter.allow(clientIp(req, config.trustProxy))) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
          return void res.end(
            JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.' } }),
          );
        }
        return proxyToBackend(config, req, res, req.url ?? pathname);
      }

      if (method === 'GET' || method === 'HEAD') {
        if (isPageRoute(pathname)) {
          if (await servePage(res, config.publicDir)) return;
        } else if (await serveStatic(req, res, config.publicDir, pathname)) {
          return;
        }
      }
      notFound(res);
    } catch (err) {
      console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown');
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Something went wrong.');
    }
  });
}

if (require.main === module) {
  // dist/src/server.js -> ../../public
  const config = loadConfig(process.env, resolve(__dirname, '..', '..', 'public'));
  createApp(config).listen(config.port, () => console.log(`frontend listening on :${config.port}`));
}
