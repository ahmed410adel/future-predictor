import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCvKey,
  isKeyForUpload,
  MAX_CV_BYTES,
  parseModelPayload,
  sanitizeFileName,
  validateCvUpload,
} from '../src';

test('validateCvUpload accepts a normal PDF', () => {
  const r = validateCvUpload({ fileName: 'cv.pdf', contentType: 'application/pdf', size: 1000 });
  assert.equal(r.ok, true);
});

test('validateCvUpload rejects big, empty and unsupported files', () => {
  const big = validateCvUpload({ fileName: 'a.pdf', contentType: 'application/pdf', size: MAX_CV_BYTES + 1 });
  assert.equal(big.ok === false && big.code, 'FILE_TOO_LARGE');
  const empty = validateCvUpload({ fileName: 'a.pdf', contentType: 'application/pdf', size: 0 });
  assert.equal(empty.ok === false && empty.code, 'INVALID_REQUEST');
  const exe = validateCvUpload({ fileName: 'a.exe', contentType: 'application/x-msdownload', size: 10 });
  assert.equal(exe.ok === false && exe.code, 'UNSUPPORTED_TYPE');
});

test('file names and keys cannot escape their folder', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('My CV (final).pdf'), 'My_CV_final_.pdf');
  const id = 'a'.repeat(32);
  assert.equal(isKeyForUpload(buildCvKey(id, 'cv.pdf'), id), true);
  assert.equal(isKeyForUpload(`cvs/${'b'.repeat(32)}/cv.pdf`, id), false);
  assert.equal(isKeyForUpload(`cvs/${id}/../x`, id), false);
});

test('parseModelPayload cleans a valid reply wrapped in code fences', () => {
  const raw =
    '```json\n' +
    JSON.stringify({
      isCv: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      currentTitle: 'Engineer',
      predictedTitle: 'Principal Engineer',
      headline: 'Leading the platform',
      narrative: 'Ada grows into a technical leader.',
      milestones: [
        { yearOffset: 5, title: 'Principal', description: 'Leads the org.' },
        { yearOffset: 1, title: 'Senior', description: 'Owns a system.' },
        { yearOffset: 99, title: 'Bad', description: 'Dropped.' },
      ],
      skillsToGrow: ['Strategy', 42],
      strengths: ['Systems'],
      confidence: 'surely',
    }) +
    '\n```';
  const p = parseModelPayload(raw);
  assert.equal(p.isCv, true);
  if (!p.isCv) return;
  assert.deepEqual(p.prediction.milestones.map((m) => m.yearOffset), [1, 5]);
  assert.deepEqual(p.prediction.skillsToGrow, ['Strategy']);
  assert.equal(p.prediction.confidence, 'low');
});

test('parseModelPayload handles "not a CV" and broken replies', () => {
  const no = parseModelPayload('{"isCv": false, "reason": "This is a recipe."}');
  assert.deepEqual(no, { isCv: false, reason: 'This is a recipe.' });
  assert.throws(() => parseModelPayload('no json here'));
  assert.throws(() => parseModelPayload('{"isCv": true}'));
});
