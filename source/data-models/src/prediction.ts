// Prediction types and the parser for what the model returns.

export const PREDICTION_YEARS = 5;

export type Confidence = 'low' | 'medium' | 'high';

export interface Milestone {
  /** Years from now, 1 to 5. */
  yearOffset: number;
  title: string;
  description: string;
}

export interface Prediction {
  currentTitle: string | null;
  predictedTitle: string;
  headline: string;
  narrative: string;
  milestones: Milestone[];
  skillsToGrow: string[];
  strengths: string[];
  confidence: Confidence;
}

export interface PredictionResult {
  /** Same value as the upload id. */
  id: string;
  createdAt: string;
  targetYear: number;
  person: { firstName: string | null; lastName: string | null };
  prediction: Prediction;
}

export interface PredictionRequest {
  uploadId: string;
  key: string;
}

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'NOT_A_CV'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'INTERNAL';

export interface ApiError {
  error: { code: ErrorCode; message: string };
}

/** What we ask the model to return. Everything else is rejected. */
export type ModelPayload =
  | { isCv: false; reason: string }
  | {
      isCv: true;
      firstName: string | null;
      lastName: string | null;
      prediction: Prediction;
    };

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned.slice(0, max);
}

function list(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => text(v, maxLen))
    .filter((v): v is string => v !== null)
    .slice(0, maxItems);
}

/** Pulls the first JSON object out of a model reply, even when it is wrapped in code fences. */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The model reply has no JSON object.');
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Validates and cleans the model output. The result is plain text only: the front end renders it
 * with textContent, and this step caps every length so a bad reply cannot flood the page or table.
 */
export function parseModelPayload(raw: string): ModelPayload {
  const data = extractJson(raw) as Record<string, unknown>;
  if (data === null || typeof data !== 'object') throw new Error('The model reply is not an object.');

  if (data.isCv !== true) {
    return { isCv: false, reason: text(data.reason, 200) ?? 'This does not look like a CV.' };
  }

  const predictedTitle = text(data.predictedTitle, 100);
  const headline = text(data.headline, 160);
  const narrative = text(data.narrative, 1200);
  if (!predictedTitle || !headline || !narrative) {
    throw new Error('The model reply is missing required fields.');
  }

  const milestones: Milestone[] = (Array.isArray(data.milestones) ? data.milestones : [])
    .map((m): Milestone | null => {
      const item = m as Record<string, unknown>;
      const yearOffset = Number(item?.yearOffset);
      const title = text(item?.title, 100);
      const description = text(item?.description, 300);
      if (!Number.isInteger(yearOffset) || yearOffset < 1 || yearOffset > PREDICTION_YEARS) return null;
      if (!title || !description) return null;
      return { yearOffset, title, description };
    })
    .filter((m): m is Milestone => m !== null)
    .sort((a, b) => a.yearOffset - b.yearOffset)
    .slice(0, 6);
  if (milestones.length === 0) throw new Error('The model reply has no valid milestones.');

  const confidence: Confidence =
    data.confidence === 'high' || data.confidence === 'medium' ? data.confidence : 'low';

  return {
    isCv: true,
    firstName: text(data.firstName, 60),
    lastName: text(data.lastName, 60),
    prediction: {
      currentTitle: text(data.currentTitle, 100),
      predictedTitle,
      headline,
      narrative,
      milestones,
      skillsToGrow: list(data.skillsToGrow, 8, 40),
      strengths: list(data.strengths, 6, 60),
      confidence,
    },
  };
}
