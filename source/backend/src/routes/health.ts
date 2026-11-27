import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../http';

/** Shallow on purpose: the internal ALB calls this often and it must not touch AWS. */
export function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { status: 'ok' });
}
