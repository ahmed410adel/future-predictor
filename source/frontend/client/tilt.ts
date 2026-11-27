/** Cursor-following 3D tilt with a soft spotlight. Mouse only; touch and reduced motion stay flat. */
export function attachTilt(el: HTMLElement, maxDeg = 7): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const reset = (): void => {
    el.classList.remove('is-hover');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${((px - 0.5) * maxDeg * 2).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - py) * maxDeg * 2).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    el.classList.add('is-hover');
  });
  el.addEventListener('pointerleave', reset);
}
