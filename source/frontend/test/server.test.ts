import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config';
import { createApp } from '../src/server';
import { RateLimiter } from '../src/security';

const publicDir = resolve(__dirname, '..', '..', 'public');

async function start(rate = '6') {
  // A tiny stand-in for the back end
  const backend = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, token: req.headers['x-owner-token'] ?? null, cookie: req.headers.cookie ?? null }));
  }).listen(0);
  const backendUrl = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
  const config = loadConfig({ BACKEND_URL: backendUrl, RATE_LIMIT_PER_MINUTE: rate, S3_UPLOAD_ORIGIN: 'https://bucket.s3.us-east-1.amazonaws.com' }, publicDir);
  const app = createApp(config).listen(0);
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  return { base, close: () => { app.close(); backend.close(); } };
}

test('health check answers without the back end', async () => {
  const { base, close } = await start();
  try {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  } finally { close(); }
});

test('the page is served with strict security headers', async () => {
  const { base, close } = await start();
  try {
    for (const path of ['/', `/r/${'a'.repeat(32)}`]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /Future Predictor/);
      const csp = res.headers.get('content-security-policy') ?? '';
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /connect-src 'self' https:\/\/bucket\.s3\.us-east-1\.amazonaws\.com/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    }
    assert.equal((await fetch(`${base}/styles.css`)).status, 200);
  } finally { close(); }
});

test('files outside public/ and unknown routes are refused', async () => {
  const { base, close } = await start();
  try {
    for (const path of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/nope', '/r/not-an-id']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, path);
    }
  } finally { close(); }
});

test('API calls reach the back end; only the owner token header goes along', async () => {
  const { base, close } = await start();
  try {
    const res = await fetch(`${base}/api/predictions/abc`, { headers: { 'x-owner-token': 't', cookie: 'secret=1' } });
    const body = (await res.json()) as { path: string; token: string; cookie: string | null };
    assert.equal(body.path, '/api/predictions/abc');
    assert.equal(body.token, 't');
    assert.equal(body.cookie, null);
  } finally { close(); }
});

test('prediction requests are rate limited per client', async () => {
  const { base, close } = await start('2');
  try {
    const post = () => fetch(`${base}/api/predictions`, { method: 'POST', body: '{}' });
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
  } finally { close(); }
});

test('RateLimiter window slides', () => {
  const l = new RateLimiter(2, 1000);
  assert.equal(l.allow('a', 0), true);
  assert.equal(l.allow('a', 10), true);
  assert.equal(l.allow('a', 20), false);
  assert.equal(l.allow('b', 20), true);
  assert.equal(l.allow('a', 1500), true);
});
