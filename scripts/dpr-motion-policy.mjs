/** Pure acceptance policy. No browser, network, app import or server setup. */
import assert from 'node:assert/strict';
export const motionViewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
// Closed, source-bound geometry experiment. Historical v1 requests retain their original policy.
const PIXEL_BUDGET_TREE = '60c442f0d379d3c111393eda9337921b6df853ecf5b6e4024f7ce05d958ab930';
const PIXEL_BUDGET_CONTRACT = 'pixel-budget-1m-v1';
const geometryRows = {
  desktop: {
    initial: { viewportWidth: 1440, viewportHeight: 900, cssWidth: 1440, cssHeight: 744, nativeDpr: 2, width: 1391, height: 718, attributeWidth: 1391, attributeHeight: 718 },
    resized: { viewportWidth: 1280, viewportHeight: 800, cssWidth: 1280, cssHeight: 644, nativeDpr: 2, width: 1409, height: 709, attributeWidth: 1409, attributeHeight: 709 },
  },
  mobile: {
    initial: { viewportWidth: 390, viewportHeight: 844, cssWidth: 390, cssHeight: 372, nativeDpr: 3, width: 585, height: 558, attributeWidth: 585, attributeHeight: 558 },
    resized: { viewportWidth: 430, viewportHeight: 900, cssWidth: 430, cssHeight: 428, nativeDpr: 3, width: 645, height: 642, attributeWidth: 645, attributeHeight: 642 },
  },
};
const geometryPhases = ['exterior-idle-before', 'exterior-orbit', 'exterior-controls-rotating', 'exterior-idle-after', 'cabin-entry', 'cabin-look', 'cabin-seat-controls', 'cabin-idle', 'viewport-change', 'resized-cabin-look', 'resized-cabin-idle'];
function validatedGeometryContract(name, sourceTree, mode, viewport) {
  if (sourceTree === PIXEL_BUDGET_TREE) assert.equal(name, PIXEL_BUDGET_CONTRACT, 'This candidate requires its exact reviewed geometry contract');
  if (name === undefined) return null;
  assert.equal(name, PIXEL_BUDGET_CONTRACT, 'Unknown geometry contract');
  assert.equal(sourceTree, PIXEL_BUDGET_TREE, 'Geometry contract source tree mismatch');
  assert.equal(mode, 'fixed', 'Geometry experiment requires fixed acceptance');
  assert.ok(Object.hasOwn(geometryRows, viewport), 'Geometry contract viewport required');
  return { name, sourceTree, maxBufferPixels: 1_000_000, maxDpr: 1.5,
    originalQualitySource: { sourceCommit: 'b3f72d6de048941ce7b21c94b13f2896849b01db', sourceTree: '0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8', maxBufferPixels: 2_000_000, maxDpr: 1.5 },
    ...geometryRows[viewport] };
}
function geometryFailures(observation, contract) {
  if (!contract) return [];
  const failures = [];
  if (JSON.stringify(observation.phases.map(p => p.name)) !== JSON.stringify(geometryPhases)) failures.push('Geometry contract requires every original phase once, in order, including deliberate resize');
  for (const phase of observation.phases) {
    if (phase.name === 'viewport-change') {
      if (phase.stable !== false) failures.push('Geometry contract requires a separate non-stable viewport-change phase');
      continue;
    }
    if (!geometryPhases.includes(phase.name)) continue;
    if (phase.stable !== true) failures.push(`${phase.name}: geometry contract requires stable evidence`);
    const expected = phase.name.startsWith('resized-') ? contract.resized : contract.initial;
    const samples = observation.dimensions.filter(d => d.phase === phase.name);
    if (!samples.length || !phase.dimensions) failures.push(`${phase.name}: geometry contract dimension evidence missing`);
    for (const sample of [phase.dimensions, ...samples]) for (const [field, value] of Object.entries(expected)) {
      if (sample?.[field] !== value) failures.push(`${phase.name}: geometry contract ${field} must equal ${value}`);
    }
  }
  return failures;
}
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
  const geometry = validatedGeometryContract(env.R35_DPR_GEOMETRY_CONTRACT, env.R35_EXPECTED_APP_TREE, env.R35_DPR_MODE, env.R35_QA_VIEWPORT);
  return { mode: env.R35_DPR_MODE, name: env.R35_QA_VIEWPORT, ...motionViewports[env.R35_QA_VIEWPORT], baseUrl: 'http://127.0.0.1:4178', geometryContract: env.R35_DPR_GEOMETRY_CONTRACT, geometry };
}
/** Resolve only the reviewed main-push request; the browser guard still requires a literal SHA. */
export function resolveMotionRequest(request, env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'This diagnostic is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab', 'Approved repository required');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Approved main ref required');
  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Diagnostic request must arrive through a main push');
  assert.ok((env.R35_DPR_COMMIT_MESSAGE ?? '').includes('[stage-dpr-motion]'), 'Reviewed diagnostic commit marker required');
  assert.ok([1, 2].includes(request.version), 'Known request schema required');
  const fields = ['allow', 'mode', 'sourceSha', 'sourceTree', 'version'];
  if (request.version === 2) fields.push('geometryContract');
  assert.deepEqual(Object.keys(request).sort(), fields.sort(), 'Only reviewed diagnostic request fields are allowed');
  if (request.version === 2) assert.equal(request.geometryContract, PIXEL_BUDGET_CONTRACT, 'Known geometry contract required');
  assert.equal(request.allow, true, 'Explicit request allow=true required');
  if (request.sourceSha === 'current') assert.equal(request.mode, 'fixed', 'current is allowed only for a reviewed fixed request');
  const resolved = {
    R35_ALLOW_DPR_MOTION_PROBE: '1', R35_DPR_MODE: request.mode,
    R35_SOURCE_SHA: request.sourceSha === 'current' ? env.GITHUB_SHA : request.sourceSha,
    R35_EXPECTED_APP_TREE: request.sourceTree,
    ...(request.version === 2 ? { R35_DPR_GEOMETRY_CONTRACT: request.geometryContract } : {}),
  };
  validateMotionEnvironment({ ...env, ...resolved });
  return resolved;
}
export function assessMotionEvidence({ mode, observation, pixels, geometryContract, sourceTree, viewport }) {
  assert.ok(['baseline', 'fixed'].includes(mode));
  const geometry = validatedGeometryContract(geometryContract, sourceTree, mode, viewport);
  const failures = [...observation.issues, ...geometryFailures(observation, geometry)];
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
