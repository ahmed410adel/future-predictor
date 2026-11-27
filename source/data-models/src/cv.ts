// CV upload rules shared by the front end (fast feedback) and the back end (the real check).

export const ALLOWED_CV_TYPES = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
} as const;

export type CvContentType = keyof typeof ALLOWED_CV_TYPES;

export const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB
export const MIN_CV_TEXT_CHARS = 200; // below this a file cannot be a real CV
export const MAX_CV_TEXT_CHARS = 20_000; // what we send to the model

export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  size: number;
}

export interface UploadUrlResponse {
  /** Also the prediction id: one upload produces one prediction. */
  uploadId: string;
  /** Proves ownership of this upload. Keep it in memory or sessionStorage, never in a URL. */
  ownerToken: string;
  /** Object key inside the CV bucket. */
  key: string;
  /** Presigned S3 URL (or the mock upload URL in local mode). */
  uploadUrl: string;
  method: 'PUT';
  /** Headers the browser must send with the PUT. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export type CvValidation =
  | { ok: true; contentType: CvContentType }
  | { ok: false; code: 'INVALID_REQUEST' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_TYPE'; message: string };

export function isAllowedCvType(contentType: string): contentType is CvContentType {
  return Object.prototype.hasOwnProperty.call(ALLOWED_CV_TYPES, contentType);
}

/** Validates the metadata of a file before any bytes are uploaded. */
export function validateCvUpload(input: {
  fileName?: unknown;
  contentType?: unknown;
  size?: unknown;
}): CvValidation {
  const { fileName, contentType, size } = input;
  if (typeof fileName !== 'string' || fileName.trim() === '' || fileName.length > 200) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'The file name is missing or too long.' };
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'The file looks empty.' };
  }
  if (size > MAX_CV_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `The file is larger than ${MAX_CV_BYTES / 1024 / 1024} MB.`,
    };
  }
  if (typeof contentType !== 'string' || !isAllowedCvType(contentType)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'Please upload a PDF, DOCX or TXT file.',
    };
  }
  return { ok: true, contentType };
}

/** Keeps letters, digits, dot, dash and underscore. Safe to use inside an S3 key. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'cv';
  const cleaned = base.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  return (cleaned || 'cv').slice(0, 80);
}

export const UPLOAD_ID_PATTERN = /^[0-9a-f]{32}$/;

/** The object key is always `cvs/<uploadId>/<safe file name>`. */
export function buildCvKey(uploadId: string, fileName: string): string {
  return `cvs/${uploadId}/${sanitizeFileName(fileName)}`;
}

export function isKeyForUpload(key: string, uploadId: string): boolean {
  return (
    UPLOAD_ID_PATTERN.test(uploadId) &&
    key.startsWith(`cvs/${uploadId}/`) &&
    /^cvs\/[0-9a-f]{32}\/[A-Za-z0-9._-]{1,80}$/.test(key)
  );
}
