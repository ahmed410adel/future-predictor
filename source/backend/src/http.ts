import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiError, ErrorCode } from '@cvfp/data-models';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } };
    return sendJson(res, err.status, body);
  }
  // Never leak internals (or CV content) to the client.
  console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown');
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong.' } };
  sendJson(res, 500, body);
}

export async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) throw new HttpError(413, 'FILE_TOO_LARGE', 'The request body is too large.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const raw = await readBody(req, maxBytes);
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'The request body must be a JSON object.');
  }
}
