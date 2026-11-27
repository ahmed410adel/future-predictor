import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Config } from '../config';

const FORWARD_REQUEST_HEADERS = ['content-type', 'content-length', 'x-owner-token'];
const BACKEND_TIMEOUT_MS = 120_000;

/**
 * Passes a browser request to the back end (the internal ALB in AWS) and streams the answer back.
 * Only the headers above go forward, and the browser never sees the back end address.
 */
export function proxyToBackend(
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): void {
  const target = new URL(path, config.backendUrl);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;

  const headers: Record<string, string> = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  const upstream = send(target, { method: req.method, headers, timeout: BACKEND_TIMEOUT_MS }, (up) => {
    res.writeHead(up.statusCode ?? 502, {
      'content-type': up.headers['content-type'] ?? 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    up.pipe(res);
  });
  const fail = () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: { code: 'UPSTREAM_FAILED', message: 'The service is not reachable right now.' } }));
  };
  upstream.on('error', fail);
  upstream.on('timeout', () => upstream.destroy());
  req.pipe(upstream);
}
