import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { UploadUrlResponse, PredictionResult } from '@cvfp/data-models';
import { loadConfig } from '../src/config';
import { buildDeps, createApp } from '../src/server';
import { MockPredictor } from '../src/services/ai';
import { makeOwnerToken, verifyOwnerToken } from '../src/services/ownership';
import { detectType, extractText } from '../src/services/text-extraction';

const CV = `Ada Lovelace
Senior Software Engineer

Summary
Engineer with ten years of experience building distributed systems and mentoring teams.

Experience
Software Engineer, Analytical Engines Ltd, 2016-2026. Built and ran payment services used by millions.
Led a team of five engineers, introduced code review and automated testing.

Education
BSc Mathematics, University of London, 2012-2015

Skills
TypeScript, AWS, DynamoDB, system design, mentoring, incident response`;

async function start() {
  const config = loadConfig({ USE_MOCKS: 'true', OWNER_TOKEN_SECRET: 'x'.repeat(40) });
  const deps = buildDeps(config);
  deps.predictor = new MockPredictor(0);
  const server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, server, deps };
}

async function upload(base: string, text: string) {
  const buf = Buffer.from(text);
  const init = await fetch(`${base}/api/uploads`, {
    method: 'POST',
    body: JSON.stringify({ fileName: 'cv.txt', contentType: 'text/plain', size: buf.length }),
  });
  assert.equal(init.status, 201);
  const u = (await init.json()) as UploadUrlResponse;
  const put = await fetch(`${base}${u.uploadUrl}`, { method: 'PUT', body: buf, headers: u.headers });
  assert.equal(put.status, 200);
  return u;
}

const predict = (base: string, u: UploadUrlResponse, token = u.ownerToken) =>
  fetch(`${base}/api/predictions`, {
    method: 'POST',
    headers: { 'x-owner-token': token },
    body: JSON.stringify({ uploadId: u.uploadId, key: u.key }),
  });

test('owner tokens verify only for the right id', () => {
  const t = makeOwnerToken('s'.repeat(40), 'a'.repeat(32));
  assert.equal(verifyOwnerToken('s'.repeat(40), 'a'.repeat(32), t), true);
  assert.equal(verifyOwnerToken('s'.repeat(40), 'b'.repeat(32), t), false);
  assert.equal(verifyOwnerToken('s'.repeat(40), 'a'.repeat(32), 'nope'), false);
});

test('file type comes from the bytes, not the label', async () => {
  assert.equal(detectType(Buffer.from('%PDF-1.7 ...')), 'application/pdf');
  assert.equal(detectType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]))?.includes('wordprocessingml'), true);
  assert.equal(detectType(Buffer.from([0x4d, 0x5a, 0x00, 0x00])), null);
  await assert.rejects(extractText(Buffer.from([0x4d, 0x5a, 0x00, 0x00])));
});

test('full flow: upload, predict, read back, wrong token rejected', async () => {
  const { base, server } = await start();
  try {
    const u = await upload(base, CV);
    const res = await predict(base, u);
    assert.equal(res.status, 201);
    const result = (await res.json()) as PredictionResult;
    assert.equal(result.person.firstName, 'Ada');
    assert.match(result.prediction.predictedTitle, /Principal/);

    const again = await predict(base, u); // idempotent
    assert.equal(again.status, 200);

    const get = await fetch(`${base}/api/predictions/${u.uploadId}`, { headers: { 'x-owner-token': u.ownerToken } });
    assert.equal(get.status, 200);
    const stolen = await fetch(`${base}/api/predictions/${u.uploadId}`, { headers: { 'x-owner-token': 'f'.repeat(64) } });
    assert.equal(stolen.status, 401);
    assert.equal((await predict(base, u, 'f'.repeat(64))).status, 401);
  } finally {
    server.close();
  }
});

test('a recipe is rejected as not a CV', async () => {
  const { base, server } = await start();
  try {
    const u = await upload(base, 'Pancakes. '.repeat(40) + 'Mix flour, milk and eggs, then fry them gently in a hot pan.');
    const res = await predict(base, u);
    assert.equal(res.status, 422);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'NOT_A_CV');
  } finally {
    server.close();
  }
});

test('bad upload requests are refused', async () => {
  const { base, server } = await start();
  try {
    const big = await fetch(`${base}/api/uploads`, {
      method: 'POST',
      body: JSON.stringify({ fileName: 'a.pdf', contentType: 'application/pdf', size: 99_000_000 }),
    });
    assert.equal(big.status, 413);
    const bad = await fetch(`${base}/api/uploads`, { method: 'POST', body: '{nope' });
    assert.equal(bad.status, 400);
    const trav = await fetch(`${base}/api/predictions`, {
      method: 'POST',
      headers: { 'x-owner-token': 'a'.repeat(64) },
      body: JSON.stringify({ uploadId: 'a'.repeat(32), key: 'cvs/other/../../x' }),
    });
    assert.equal(trav.status, 401);
  } finally {
    server.close();
  }
});
