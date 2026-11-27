import type { ApiError, PredictionResult, UploadUrlResponse } from '@cvfp/data-models';

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readJson<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // not JSON, handled below
  }
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiFailure(err?.message ?? 'Something went wrong. Please try again.', err?.code ?? 'INTERNAL', res.status);
  }
  return body as T;
}

/** Step 1: ask the back end for a presigned upload URL. */
export async function createUpload(file: File, contentType: string): Promise<UploadUrlResponse> {
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentType, size: file.size }),
  });
  return readJson<UploadUrlResponse>(res);
}

/** Step 2: send the file straight to S3 (or to the local mock). */
export async function putFile(upload: UploadUrlResponse, file: File): Promise<void> {
  let res: Response;
  try {
    res = await fetch(upload.uploadUrl, { method: upload.method, headers: upload.headers, body: file });
  } catch {
    throw new ApiFailure('The upload could not reach storage. Check your connection and try again.', 'UPLOAD_FAILED', 0);
  }
  if (!res.ok) throw new ApiFailure('The upload was rejected. Please try again.', 'UPLOAD_FAILED', res.status);
}

/** Step 3: ask for the prediction. This is the slow call (a few seconds up to ~30). */
export async function createPrediction(upload: UploadUrlResponse): Promise<PredictionResult> {
  const res = await fetch('/api/predictions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-owner-token': upload.ownerToken },
    body: JSON.stringify({ uploadId: upload.uploadId, key: upload.key }),
  });
  return readJson<PredictionResult>(res);
}

export async function getPrediction(id: string, token: string): Promise<PredictionResult> {
  const res = await fetch(`/api/predictions/${id}`, { headers: { 'x-owner-token': token } });
  return readJson<PredictionResult>(res);
}
