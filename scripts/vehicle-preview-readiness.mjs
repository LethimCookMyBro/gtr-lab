import { waitForFunctionalCapture } from './functional-capture-readiness.mjs';

/** Serialized as one predicate, so DOM, requested state and native completion
 * share one existing budget. This never renders or changes application state.
 */
export function environmentCaptureReady({ environment: requested, functional }) {
  // Poll first: its absolute deadline rejects late success even after a JS stall.
  const certificate = functional && globalThis.__gtrFunctionalCapture.poll(functional);
  const failure = document.querySelector('.render-error, vite-error-overlay');
  if (failure) throw new Error(`${requested} environment failed: ${failure.textContent?.trim() || failure.className}`);
  const notices = [...document.querySelectorAll('.scene-notice')];
  for (const notice of notices) {
    const pending = notice.getAttribute('role') === 'status' &&
      notice.getAttribute('aria-live') === 'polite' &&
      notice.querySelector('p')?.textContent.replace(/\s+/g, ' ').trim() ===
        'Rendering is taking longer than usual. You can keep waiting or retry the viewer.' &&
      notice.querySelector('button')?.textContent.trim() === 'Retry viewer';
    if (!pending) throw new Error(`${requested} environment failed: ${notice.textContent?.trim() || notice.className}`);
  }
  const scene = document.querySelector('main.configurator');
  const paint = document.querySelector('button[aria-label="Ultimate Silver"]');
  const lights = document.querySelector('.config-toolbar button[aria-label="Lights"]');
  const ready = Boolean(
    scene?.classList.contains(`environment-${requested}`) &&
    scene.classList.contains('is-scene-ready') &&
    paint && !paint.disabled && lights && !lights.disabled &&
    document.querySelectorAll('.scene-stage canvas').length === 1 &&
    !document.querySelector('.scene-loading') && notices.length === 0
  );
  if (!ready || (functional && !certificate)) return false;
  if (!functional) return true;
  // Read the selected public swatch, then require that exact paint and venue in
  // the completed native draw. A ready DOM alone cannot certify old pixels.
  const swatch = document.querySelector('.paint-swatches button[aria-pressed="true"] .swatch');
  const rgb = swatch?.style.backgroundColor.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  const selectedPaint = rgb && '#' + rgb.slice(1).map(value => Number(value).toString(16).padStart(2, '0')).join('');
  return Boolean(selectedPaint &&
    certificate.snapshot.vehicle.environment === requested &&
    certificate.snapshot.vehicle.paint.toLowerCase() === selectedPaint);
}

/** Await the selected venue, treating the shipped delay notice as pending. */
export async function waitForEnvironmentReady(page, environment, { timeout = 90000, functional } = {}) {
  return page.waitForFunction(environmentCaptureReady, { environment, functional }, { timeout, polling: 100 });
}

/** Compose the existing functional certificate with exterior DOM/state checks.
 * The functional helper still owns deadline, dimensions, request and native proof.
 */
export async function waitForExteriorCapture(page, { preset, environment, timeout = 15000 }) {
  return waitForFunctionalCapture({
    evaluate: (...args) => page.evaluate(...args),
    waitForFunction: (_predicate, functional, options) =>
      page.waitForFunction(environmentCaptureReady, { environment, functional }, options),
  }, { preset, timeout });
}

/** Best-effort failure evidence only; never retries or repairs readiness. */
export async function readFunctionalCaptureFailure(page) {
  try {
    return await page.evaluate(() => globalThis.__gtrFunctionalCapture?.snapshot() ?? null);
  } catch {
    return null;
  }
}
