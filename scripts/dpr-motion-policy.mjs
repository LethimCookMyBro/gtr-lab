/** Pure acceptance policy. No browser, network, app import or server setup. */
import assert from 'node:assert/strict';
export const motionViewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
export function validateMotionEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'This diagnostic is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab', 'Approved repository required');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Approved main ref required');
  assert.equal(env.R35_ALLOW_DPR_MOTION_PROBE, '1', 'Explicit motion diagnostic opt-in required');
  for (const key of ['GITHUB_SHA', 'R35_SOURCE_SHA']) assert.match(env[key] ?? '', /^[a-f0-9]{40}$/, `Exact ${key} required`);
  assert.match(env.R35_EXPECTED_APP_TREE ?? '', /^[a-f0-9]{64}$/, 'Reviewed source tree digest required');
  assert.ok(['baseline', 'fixed'].includes(env.R35_DPR_MODE), 'Choose baseline or fixed mode');
  assert.ok(Object.hasOwn(motionViewports, env.R35_QA_VIEWPORT), 'Choose desktop or mobile viewport');
  assert.equal(env.R35_DPR_BASE_URL, undefined, 'Arbitrary/live target override forbidden');
  return { mode: env.R35_DPR_MODE, name: env.R35_QA_VIEWPORT, ...motionViewports[env.R35_QA_VIEWPORT], baseUrl: 'http://127.0.0.1:4178' };
}
/** Resolve only the reviewed main-push request; the browser guard still requires a literal SHA. */
export function resolveMotionRequest(request, env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'This diagnostic is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab', 'Approved repository required');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Approved main ref required');
  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Diagnostic request must arrive through a main push');
  assert.ok((env.R35_DPR_COMMIT_MESSAGE ?? '').includes('[stage-dpr-motion]'), 'Reviewed diagnostic commit marker required');
  assert.deepEqual(Object.keys(request).sort(), ['allow', 'mode', 'sourceSha', 'sourceTree', 'version'], 'Only reviewed diagnostic request fields are allowed');
  assert.equal(request.version, 1, 'Known request schema required');
  assert.equal(request.allow, true, 'Explicit request allow=true required');
  if (request.sourceSha === 'current') assert.equal(request.mode, 'fixed', 'current is allowed only for a reviewed fixed request');
  const resolved = {
    R35_ALLOW_DPR_MOTION_PROBE: '1', R35_DPR_MODE: request.mode,
    R35_SOURCE_SHA: request.sourceSha === 'current' ? env.GITHUB_SHA : request.sourceSha,
    R35_EXPECTED_APP_TREE: request.sourceTree,
  };
  validateMotionEnvironment({ ...env, ...resolved });
  return resolved;
}
export function assessMotionEvidence({ mode, observation, pixels }) {
  assert.ok(['baseline', 'fixed'].includes(mode));
  const failures = [...observation.issues];
  const stable = new Map(observation.phases.filter(p => p.stable).map(p => [p.name, p]));
  const stableWrites = observation.events.filter(e => e.kind === 'canvas-write' && stable.has(e.phase));
  const blankSamples = pixels.filter(p => p.blank);
  const scene = observation.contexts.filter(c => c.sceneCanvas);
  if (scene.length !== 1 || scene.some(c => c.lostEvents || c.restoredEvents || !c.connected)) failures.push('Scene context creation/loss/restoration/detachment churn');
  if (mode === 'fixed') {
    if (stableWrites.length) failures.push(`${stableWrites.length} unexpected stable-viewport canvas writes (same-size writes clear too)`);
    if (blankSamples.length) failures.push(`${blankSamples.length} blank screenshot samples`);
    for (const phase of stable.values()) {
      const expected = phase.dimensions;
      if (!expected || !observation.dimensions.some(d => d.phase === phase.name)) { failures.push(`${phase.name}: missing buffer dimensions`); continue; }
      for (const d of observation.dimensions.filter(d => d.phase === phase.name)) {
        if (d.contextId !== phase.contextId || d.width !== expected.width || d.height !== expected.height || d.cssWidth !== expected.cssWidth || d.cssHeight !== expected.cssHeight || d.nativeDpr !== expected.nativeDpr) failures.push(`${phase.name}: stable canvas dimension changed`);
        if (d.width * d.height > 2_000_000) failures.push(`${phase.name}: drawing-buffer pixel budget exceeded`);
        if (d.width > Math.ceil(d.cssWidth * Math.min(d.nativeDpr, 1.5)) || d.height > Math.ceil(d.cssHeight * Math.min(d.nativeDpr, 1.5))) failures.push(`${phase.name}: native/1.5 DPR ceiling exceeded`);
        if (!(d.width > 0 && d.height > 0 && d.cssWidth > 0 && d.cssHeight > 0)) failures.push(`${phase.name}: empty canvas dimensions`);
      }
    }
  }
  return { mode, stableWrites, blankSamples, failures: [...new Set(failures)] };
}
/** The scene hash includes its mask layout: equal layout is required before interpreting pixel change. */
export function assertPointerMotionPixels(first, last) {
  assert(first && last && !first.blank && !last.blank, 'Pointer movement needs two nonblank scene samples');
  assert.equal(typeof first.scene?.layout, 'string', 'Pointer movement needs the observed scene layout');
  assert.equal(first.scene.layout, last.scene?.layout, 'Pointer movement is unproven because the observed scene layout changed');
  assert.notEqual(first.scene.sha256, last.scene.sha256, 'No changed scene pixels after native pointer input');
}
/** Composited screenshot sample, with observed DOM overlays excluded. Never GL readPixels. */
export function summarizeScenePixels(png, bounds, overlays = []) {
  const left = Math.ceil(bounds.x + 2), top = Math.ceil(bounds.y + 2);
  const right = Math.floor(bounds.x + bounds.width - 2), bottom = Math.floor(bounds.y + bounds.height - 2);
  assert(left >= 0 && top >= 0 && right <= png.width && bottom <= png.height, 'Canvas exceeds screenshot');
  const low = [255, 255, 255], high = [0, 0, 0]; let pixels = 0, nearBlack = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (overlays.some(r => x >= Math.floor(r.x) && y >= Math.floor(r.y) && x < Math.ceil(r.x + r.width) && y < Math.ceil(r.y + r.height))) continue;
    const p = (y * png.width + x) * 4; pixels++;
    if (png.data[p] <= 8 && png.data[p + 1] <= 8 && png.data[p + 2] <= 8) nearBlack++;
    for (let c = 0; c < 3; c++) { low[c] = Math.min(low[c], png.data[p + c]); high[c] = Math.max(high[c], png.data[p + c]); }
  }
  assert(pixels > bounds.width * bounds.height / 2, 'Visible-scene evidence must retain more than half the canvas');
  const channelRanges = low.map((value, c) => high[c] - value);
  return { pixels, nearBlackFraction: nearBlack / pixels, channelRanges, blank: nearBlack / pixels >= .999 || channelRanges.every(r => r <= 1), contract: 'bounded-composited-scene-sample-v1' };
}
