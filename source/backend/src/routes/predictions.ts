import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  isKeyForUpload,
  MIN_CV_TEXT_CHARS,
  PREDICTION_YEARS,
  UPLOAD_ID_PATTERN,
  type PredictionResult,
} from '@cvfp/data-models';
import type { Config } from '../config';
import { HttpError, readJson, sendJson } from '../http';
import { UpstreamError, type Predictor } from '../services/ai';
import { verifyOwnerToken } from '../services/ownership';
import type { ResultItem, ResultsStore } from '../services/results';
import type { CvStorage } from '../services/storage';
import { extractText, UnreadableCvError } from '../services/text-extraction';

export interface PredictionDeps {
  config: Config;
  storage: CvStorage;
  results: ResultsStore;
  predictor: Predictor;
  now?: () => Date;
}

function requireOwner(req: IncomingMessage, deps: PredictionDeps, uploadId: unknown): string {
  const header = req.headers['x-owner-token'];
  if (typeof uploadId !== 'string' || !UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'The upload id is not valid.');
  }
  // Same answer for "wrong token" and "unknown id", so ids cannot be probed.
  if (!verifyOwnerToken(deps.config.ownerTokenSecret, uploadId, header)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'You do not have access to this prediction.');
  }
  return uploadId;
}

/** POST /api/predictions: read the CV from S3, check it, ask Bedrock, save to DynamoDB. */
export async function handleCreatePrediction(
  req: IncomingMessage,
  res: ServerResponse,
  deps: PredictionDeps,
): Promise<void> {
  const body = await readJson(req);
  const id = requireOwner(req, deps, body.uploadId);
  const key = body.key;
  if (typeof key !== 'string' || !isKeyForUpload(key, id)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'The file key does not match this upload.');
  }

  // Asking twice (double click, retry) returns the first answer instead of paying for a new one.
  const existing = await deps.results.get(id);
  if (existing) return sendJson(res, 200, existing.result);

  const file = await deps.storage.readCv(key);
  if (!file) throw new HttpError(404, 'NOT_FOUND', 'We could not find your upload. Please try again.');

  let text: string;
  try {
    text = await extractText(file);
  } catch (err) {
    if (err instanceof UnreadableCvError) {
      throw new HttpError(422, 'NOT_A_CV', 'We could not read any text from this file.');
    }
    throw err;
  }
  if (text.length < MIN_CV_TEXT_CHARS) {
    throw new HttpError(422, 'NOT_A_CV', 'This file has too little text to be a CV.');
  }

  const now = (deps.now ?? (() => new Date()))();
  let payload;
  try {
    payload = await deps.predictor.predict(text, now);
  } catch (err) {
    if (err instanceof UpstreamError) {
      throw new HttpError(502, 'UPSTREAM_FAILED', 'The prediction service is busy. Please try again.');
    }
    throw err;
  }
  if (!payload.isCv) throw new HttpError(422, 'NOT_A_CV', payload.reason);

  const result: PredictionResult = {
    id,
    createdAt: now.toISOString(),
    targetYear: now.getFullYear() + PREDICTION_YEARS,
    person: { firstName: payload.firstName, lastName: payload.lastName },
    prediction: payload.prediction,
  };
  const item: ResultItem = {
    id,
    firstName: payload.firstName,
    lastName: payload.lastName,
    title: payload.prediction.currentTitle,
    cvKey: key,
    createdAt: result.createdAt,
    result,
    ...(deps.config.resultTtlDays
      ? { expiresAt: Math.floor(now.getTime() / 1000) + deps.config.resultTtlDays * 86400 }
      : {}),
  };
  try {
    await deps.results.save(item);
  } catch (err) {
    const winner = await deps.results.get(id); // a parallel request saved first
    if (winner) return sendJson(res, 200, winner.result);
    throw err;
  }
  sendJson(res, 201, result);
}

/** GET /api/predictions/:id */
export async function handleGetPrediction(
  req: IncomingMessage,
  res: ServerResponse,
  deps: PredictionDeps,
  id: string,
): Promise<void> {
  requireOwner(req, deps, id);
  const item = await deps.results.get(id);
  if (!item) throw new HttpError(404, 'NOT_FOUND', 'No prediction found.');
  sendJson(res, 200, item.result);
}
