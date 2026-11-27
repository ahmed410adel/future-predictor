import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildCvKey,
  MAX_CV_BYTES,
  validateCvUpload,
  type UploadUrlResponse,
} from '@cvfp/data-models';
import type { Config } from '../config';
import { HttpError, readBody, readJson, sendJson } from '../http';
import { makeOwnerToken, newUploadId } from '../services/ownership';
import type { CvStorage, MemoryCvStorage } from '../services/storage';

/** POST /api/uploads: checks the file details and hands back a short-lived presigned S3 URL. */
export async function handleCreateUpload(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { config: Config; storage: CvStorage },
): Promise<void> {
  const body = await readJson(req);
  const check = validateCvUpload(body);
  if (!check.ok) throw new HttpError(check.code === 'FILE_TOO_LARGE' ? 413 : 400, check.code, check.message);

  const uploadId = newUploadId();
  const key = buildCvKey(uploadId, String(body.fileName));
  const signed = await deps.storage.presignUpload(key, check.contentType, Number(body.size));

  const response: UploadUrlResponse = {
    uploadId,
    ownerToken: makeOwnerToken(deps.config.ownerTokenSecret, uploadId),
    key,
    uploadUrl: signed.url,
    method: 'PUT',
    headers: signed.headers,
    expiresInSeconds: signed.expiresInSeconds,
  };
  sendJson(res, 201, response);
}

/** PUT /mock-s3/cvs/<id>/<name>: stands in for S3 when USE_MOCKS=true. */
export async function handleMockUpload(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  storage: MemoryCvStorage,
): Promise<void> {
  const key = pathname.replace(/^\/mock-s3\//, '');
  if (!/^cvs\/[0-9a-f]{32}\/[A-Za-z0-9._-]{1,80}$/.test(key)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Bad upload path.');
  }
  storage.files.set(key, await readBody(req, MAX_CV_BYTES));
  res.writeHead(200, { 'content-length': '0' });
  res.end();
}
