import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** `/` and `/r/<id>` are the same single page; the script reads the URL to choose the view. */
export function isPageRoute(pathname: string): boolean {
  return pathname === '/' || /^\/r\/[0-9a-f]{32}$/.test(pathname);
}

export async function servePage(res: ServerResponse, publicDir: string): Promise<boolean> {
  return serveFile(res, join(publicDir, "index.html"), "no-cache");
}

/** Serves files from `public/` only. Anything that resolves outside it is refused. */
export async function serveStatic(
  _req: IncomingMessage,
  res: ServerResponse,
  publicDir: string,
  pathname: string,
): Promise<boolean> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;
  const file = normalize(join(publicDir, decoded));
  if (file !== publicDir && !file.startsWith(publicDir + sep)) return false;
  const ext = extname(file);
  if (!TYPES[ext]) return false;
  // Built bundles have no hash in their name, so ask the browser to recheck each time.
  return serveFile(res, file, 'no-cache');
}

async function serveFile(res: ServerResponse, file: string, cache: string): Promise<boolean> {
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': cache,
    });
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}
