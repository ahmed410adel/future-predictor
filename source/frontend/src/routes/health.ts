import type { IncomingMessage, ServerResponse } from 'node:http';

/** Health check for the public ALB. Does not call the back end, so a back end outage cannot make the ALB pull every front end instance. */
export function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end('{"status":"ok"}');
}
