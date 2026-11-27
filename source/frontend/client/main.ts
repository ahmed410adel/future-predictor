import {
  ALLOWED_CV_TYPES,
  PREDICTION_YEARS,
  validateCvUpload,
  type PredictionResult,
  type UploadUrlResponse,
} from '@cvfp/data-models';
import { ApiFailure, createPrediction, createUpload, getPrediction, putFile } from './api';
import { startScene, type SceneControls } from './scene';
import { attachTilt } from './tilt';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

type View = 'upload' | 'progress' | 'result';
type Step = 'upload' | 'read' | 'think' | 'render';
const STEP_ORDER: Step[] = ['upload', 'read', 'think', 'render'];
const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

const tokenKey = (id: string): string => `cvfp:token:${id}`;

let scene: SceneControls | null = null;
let selected: { file: File; contentType: string } | null = null;
let currentResult: PredictionResult | null = null;
let stepTimer = 0;

// ---------------------------------------------------------------------------------------------
// View helpers

function setView(view: View): void {
  for (const v of ['upload', 'progress', 'result'] as View[]) $(`view-${v}`).hidden = v !== view;
}

function showError(message: string | null): void {
  const box = $('error');
  box.hidden = message === null;
  box.textContent = message ?? '';
}

function setStep(step: Step): void {
  const at = STEP_ORDER.indexOf(step);
  $('steps')
    .querySelectorAll('li')
    .forEach((li, i) => {
      li.classList.toggle('done', i < at);
      li.classList.toggle('active', i === at);
    });
}

function chip(text: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'chip';
  li.textContent = text; // textContent only: the model's text is never parsed as HTML
  return li;
}

// ---------------------------------------------------------------------------------------------
// Upload view

function resolveType(file: File): string {
  if (file.type in ALLOWED_CV_TYPES) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[ext] ?? file.type;
}

function refreshGo(): void {
  $<HTMLButtonElement>('go').disabled = !(selected && $<HTMLInputElement>('consent').checked);
}

function pickFile(file: File | undefined): void {
  showError(null);
  if (!file) return;
  const contentType = resolveType(file);
  const check = validateCvUpload({ fileName: file.name, contentType, size: file.size });
  if (!check.ok) {
    selected = null;
    $('dropzone').classList.remove('has-file');
    $('file-name').hidden = true;
    showError(check.message);
    refreshGo();
    return;
  }
  selected = { file, contentType };
  $('dropzone').classList.add('has-file');
  const label = $('file-name');
  label.hidden = false;
  label.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  refreshGo();
}

function wireUpload(): void {
  const input = $<HTMLInputElement>('file');
  const zone = $('dropzone');
  $('choose').addEventListener('click', () => input.click());
  input.addEventListener('change', () => pickFile(input.files?.[0]));
  $('consent').addEventListener('change', refreshGo);

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    pickFile(e.dataTransfer?.files?.[0]);
  });
  $('go').addEventListener('click', () => void run());
  $('again').addEventListener('click', reset);
  $('copy').addEventListener('click', () => void copySummary());
}

function reset(): void {
  selected = null;
  currentResult = null;
  $<HTMLInputElement>('file').value = '';
  $<HTMLInputElement>('consent').checked = false;
  $('dropzone').classList.remove('has-file');
  $('file-name').hidden = true;
  showError(null);
  refreshGo();
  setView('upload');
  if (location.pathname !== '/') history.pushState({}, '', '/');
  $('predictor').focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------------------------
// The main flow: upload to S3, then ask for the prediction

async function run(): Promise<void> {
  if (!selected) return;
  const { file, contentType } = selected;
  showError(null);
  setView('progress');
  setStep('upload');
  scene?.setBusy(true);

  try {
    const upload: UploadUrlResponse = await createUpload(file, contentType);
    await putFile(upload, file);
    sessionStorage.setItem(tokenKey(upload.uploadId), upload.ownerToken);

    setStep('read');
    // The server does reading and forecasting in one request, so the middle steps are paced by time.
    stepTimer = window.setTimeout(() => setStep('think'), 2500);
    const result = await createPrediction(upload);

    clearTimeout(stepTimer);
    setStep('render');
    await new Promise((r) => setTimeout(r, 450));
    showResult(result);
    history.pushState({}, '', `/r/${result.id}`);
  } catch (err) {
    clearTimeout(stepTimer);
    scene?.setBusy(false);
    setView('upload');
    showError(err instanceof ApiFailure ? err.message : 'Something went wrong. Please try again.');
    $('predictor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------------------------------------------------------------------------------------
// Result view

function showResult(result: PredictionResult): void {
  currentResult = result;
  const p = result.prediction;
  scene?.setBusy(false);
  scene?.pulse();

  $('r-hello').textContent = result.person.firstName ? `Hi ${result.person.firstName},` : 'Hello,';
  $('r-year').textContent = String(result.targetYear);
  $('r-title').textContent = p.predictedTitle;
  $('r-headline').textContent = p.headline;
  $('r-narrative').textContent = p.narrative;

  const path = $('r-path');
  path.hidden = !p.currentTitle;
  if (p.currentTitle) {
    $('r-from').textContent = p.currentTitle;
    $('r-to').textContent = p.predictedTitle;
  }

  const timeline = $('r-timeline');
  timeline.replaceChildren(
    ...p.milestones.map((m, i) => {
      const li = document.createElement('li');
      li.className = 'milestone';
      li.style.setProperty('--i', String(i));
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = m.yearOffset === 1 ? 'In 1 year' : `In ${m.yearOffset} years`;
      const h = document.createElement('h5');
      h.textContent = m.title;
      const d = document.createElement('p');
      d.textContent = m.description;
      li.append(when, h, d);
      return li;
    }),
  );
  timeline.querySelectorAll<HTMLElement>('.milestone').forEach((el) => attachTilt(el, 6));

  $('r-skills').replaceChildren(...p.skillsToGrow.map(chip));
  $('r-strengths').replaceChildren(...p.strengths.map(chip));
  const confidenceText = {
    low: 'Confidence: low. Your CV gave us only a few signals to work with.',
    medium: 'Confidence: medium. A fair amount of signal in your CV.',
    high: 'Confidence: high. Your CV shows a clear trajectory.',
  }[p.confidence];
  $('r-confidence').textContent = confidenceText;
  $('copied').textContent = '';

  setView('result');
  const title = $('r-title');
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
  $('predictor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copySummary(): Promise<void> {
  if (!currentResult) return;
  const p = currentResult.prediction;
  const text = `In ${currentResult.targetYear} I could be a ${p.predictedTitle}: ${p.headline}`;
  try {
    await navigator.clipboard.writeText(text);
    $('copied').textContent = 'Copied to your clipboard.';
  } catch {
    $('copied').textContent = 'Could not copy automatically. Select the text and copy it instead.';
  }
}

// ---------------------------------------------------------------------------------------------
// Opening /r/<id> (reload or back button): only the browser that made the upload holds the token

async function route(): Promise<void> {
  const m = location.pathname.match(/^\/r\/([0-9a-f]{32})$/);
  if (!m) {
    if (!$('view-progress').hidden) return; // a request is running
    setView('upload');
    return;
  }
  const token = sessionStorage.getItem(tokenKey(m[1]));
  if (!token) {
    history.replaceState({}, '', '/');
    setView('upload');
    showError('That result is only available in the browser tab that created it. Upload your CV again to see it.');
    return;
  }
  setView('progress');
  setStep('render');
  try {
    showResult(await getPrediction(m[1], token));
  } catch {
    history.replaceState({}, '', '/');
    setView('upload');
    showError('We could not load that result. Please upload your CV again.');
  }
}

// ---------------------------------------------------------------------------------------------

function init(): void {
  $('target-year').textContent = String(new Date().getFullYear() + PREDICTION_YEARS);
  const canvas = $<HTMLCanvasElement>('scene');
  scene = startScene(canvas);
  if (!scene) document.body.classList.add('no-webgl');

  document.querySelectorAll<HTMLElement>('.card').forEach((el) => attachTilt(el, 8));
  attachTilt($('panel'), 2.2);
  wireUpload();
  window.addEventListener('popstate', () => void route());
  void route();
}

init();
