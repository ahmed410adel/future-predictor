import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { MAX_CV_TEXT_CHARS, type CvContentType } from '@cvfp/data-models';

export class UnreadableCvError extends Error {}

/** Decides the real file type from the first bytes. The browser-supplied type is not trusted. */
export function detectType(buf: Buffer): CvContentType | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  const head = buf.subarray(0, 8000);
  if (head.length > 0 && !head.includes(0)) return 'text/plain';
  return null;
}

function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CV_TEXT_CHARS);
}

export async function extractText(buf: Buffer): Promise<string> {
  const type = detectType(buf);
  if (!type) throw new UnreadableCvError('Unsupported file content.');
  try {
    switch (type) {
      case 'application/pdf':
        return normalise((await pdfParse(buf)).text);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return normalise((await mammoth.extractRawText({ buffer: buf })).value);
      case 'text/plain':
        return normalise(buf.toString('utf8'));
    }
  } catch {
    throw new UnreadableCvError('The file could not be read.');
  }
}
