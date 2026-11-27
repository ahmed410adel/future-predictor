import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 hex characters. Also used as the prediction id. */
export function newUploadId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Stateless proof of ownership: HMAC(secret, uploadId). The browser receives it once, when the
 * upload starts, and sends it back in the `x-owner-token` header. No table lookup is needed.
 */
export function makeOwnerToken(secret: string, uploadId: string): string {
  return createHmac('sha256', secret).update(`owner:${uploadId}`).digest('hex');
}

export function verifyOwnerToken(secret: string, uploadId: string, token: unknown): boolean {
  if (typeof token !== 'string' || token.length !== 64) return false;
  const expected = Buffer.from(makeOwnerToken(secret, uploadId), 'hex');
  const given = Buffer.from(token, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
