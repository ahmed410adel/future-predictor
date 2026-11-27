import type { IncomingMessage, ServerResponse } from 'node:http';

/** Content-Security-Policy. The browser may talk to this site and to the S3 bucket, nothing else. */
export function securityHeaders(s3Origin: string): Record<string, string> {
  const connect = ["'self'", ...(s3Origin ? [s3Origin] : [])].join(' ');
  return {
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      `connect-src ${connect}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
}

export function applyHeaders(res: ServerResponse, headers: Record<string, string>): void {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

/** Sliding one-minute counter per client. In memory: fine for a learning project, one box. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}

/** Behind the ALB the last X-Forwarded-For entry is the address the ALB saw. */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const last = (Array.isArray(xff) ? xff.join(',') : xff)?.split(',').pop()?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
