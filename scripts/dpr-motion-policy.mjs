/** Pure acceptance policy. No browser, network, app import or server setup. */
import assert from 'node:assert/strict';
export const motionViewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
// Closed, source-bound geometry experiment. Historical v1 requests retain their original policy.
const PIXEL_BUDGET_TREE = '60c442f0d379d3c111393eda9337921b6df853ecf5b6e4024f7ce05d958ab930';
const PIXEL_BUDGET_CONTRACT = 'pixel-budget-1m-v1';
const MSAA_OFF_TREE = '8c35f77f0d20e5679dade1e7dd8197ef493deef165b990672b510e9ea7e76145';
const MSAA_OFF_CONTRACT = 'msaa-off-2m-v1';
// Exact reviewed production source identity; no runtime overrides or wildcard.
const STATIC_STUDIO_TREE = '6353f4929c3c9ef3387a0cedfa43d53e685d08592ca43a307304eac1e76a4261';
const STATIC_STUDIO_CONTRACT = 'static-studio-batching-2m-msaa-v1';
const BRAKE_INDEX_TREE = '6bdc7f056b9a0a58f37271423b020e4930b987ea43764620d95dd5bd2440795e';
const BRAKE_INDEX_CONTRACT = 'brake-index-lod-2m-msaa-v1';
// Independent pacing experiment on the original geometry; never reuse the brake contract.
const RENDER_BACKPRESSURE_TREE = 'c3e6b02d198bbcdad46d403101706bbe859390d72729c6391adb01751ba0c3ca';
const RENDER_BACKPRESSURE_CONTRACT = 'render-backpressure-2m-msaa-v1';
// Separately reviewed resize, since-target timing and opt-in functional observation repair.
const RENDER_REPAIR_TREE = '814ff47e781f112127596422caad0413c176331f892e9dc5697e10a1c36923c1';
const RENDER_REPAIR_CONTRACT = 'render-repair-readiness-2m-msaa-v1';
// First cabin entry cut; functional-consumer repair cannot replace full native-motion evidence.
const CABIN_ENTRY_FUNCTIONAL_TREE = '387e680e590c1bf1d0f420b7405b7e3bb9ed4d62b7fc46c58129c178e82512f5';
const CABIN_ENTRY_FUNCTIONAL_CONTRACT = 'cabin-entry-functional-2m-msaa-v1';
// Optional-cabin contact-shadow isolation and exact clamped-key no-op repair; original capture acceptance remains required.
const CONTACT_SHADOW_TREE = '79386e6926c422a81d2fd11a150faefe6513fcb8a89eb15872bc8beeb78d2ee8';
const CONTACT_SHADOW_CONTRACT = 'contact-shadow-clamp-stability-2m-msaa-v1';
// Terminal rig orientation and own-demand repair; preserve every native-motion and lifecycle acceptance gate.
const CAMERA_TERMINAL_TREE = 'd37a85b85db277453e836dddec2ff0472235aec791a54e1bbdb4124c9eb575b6';
const CAMERA_TERMINAL_CONTRACT = 'camera-terminal-orientation-2m-msaa-v1';
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
const fullMotionCaptures = [
  ['01-exterior-before', 'exterior-idle-before'], ['02-orbit-mid', 'exterior-orbit'], ['03-orbit-end', 'exterior-orbit'],
  ['04-controls-mid', 'exterior-controls-rotating'], ['05-controls-end', 'exterior-controls-rotating'], ['06-exterior-idle', 'exterior-idle-after'],
  ['07-cabin-driver', 'cabin-entry'], ['08-cabin-look-mid', 'cabin-look'], ['09-cabin-look-end', 'cabin-look'],
  ['10-cabin-seats', 'cabin-seat-controls'], ['11-cabin-idle', 'cabin-idle'], ['12-resized-look', 'resized-cabin-look'], ['13-resized-idle', 'resized-cabin-idle'],
];
const contracts = {
  [PIXEL_BUDGET_CONTRACT]: { sourceTree: PIXEL_BUDGET_TREE, maxBufferPixels: 1_000_000, rows: geometryRows },
  [MSAA_OFF_CONTRACT]: { sourceTree: MSAA_OFF_TREE, maxBufferPixels: 2_000_000,
    contextCreation: { requestedAntialias: false, antialias: false, samples: 0, sampleBuffers: 0 },
    rows: { ...geometryRows, desktop: {
      initial: { ...geometryRows.desktop.initial, width: 1967, height: 1016, attributeWidth: 1967, attributeHeight: 1016 },
      resized: { ...geometryRows.desktop.resized, width: 1920, height: 966, attributeWidth: 1920, attributeHeight: 966 },
    } },
  },
};
contracts[STATIC_STUDIO_CONTRACT] = { sourceTree: STATIC_STUDIO_TREE, maxBufferPixels: 2_000_000,
  contextCreation: { requestedAntialias: true, antialias: true, multisampled: true },
  rows: contracts[MSAA_OFF_CONTRACT].rows, captures: fullMotionCaptures,
};
contracts[BRAKE_INDEX_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: BRAKE_INDEX_TREE };
contracts[RENDER_BACKPRESSURE_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: RENDER_BACKPRESSURE_TREE };
contracts[RENDER_REPAIR_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: RENDER_REPAIR_TREE };
contracts[CABIN_ENTRY_FUNCTIONAL_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: CABIN_ENTRY_FUNCTIONAL_TREE };
contracts[CONTACT_SHADOW_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: CONTACT_SHADOW_TREE };
contracts[CAMERA_TERMINAL_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: CAMERA_TERMINAL_TREE };
// Historical source-pinned motion must not inherit the current runtime model URL.
const originalMotionModels = [
  { path: '/models/r35-cabin-dashboard-5c0a9dca.glb', bytes: 19_170_816, sha256: '5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326' },
  { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' },
  { path: '/models/r35-exterior-cabin-proxy-49d7c2ab.glb', bytes: 956_368, sha256: '49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347' },
];
const brakeMotionModels = originalMotionModels.map((model, index) => index === 1
  ? { path: '/models/ciasny-r35-brake-index-e9425289.glb', bytes: 8_566_388, sha256: 'e942528980753f9dea6218bdf50ab943b13974b288faf2fd2305984b600fb1c9' } : model);
export function motionModelsForSource(sourceTree) {
  assert.match(sourceTree ?? '', /^[a-f0-9]{64}$/, 'Exact motion model source tree required');
  return sourceTree === BRAKE_INDEX_TREE ? brakeMotionModels : originalMotionModels;
}
// Returned report geometry must never provide a mutation path into acceptance policy.
function freezePolicy(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezePolicy(child);
  return Object.freeze(value);
}
freezePolicy(contracts);
freezePolicy(originalMotionModels);
freezePolicy(brakeMotionModels);
function validatedGeometryContract(name, sourceTree, mode, viewport) {
  const required = Object.entries(contracts).find(([, contract]) => contract.sourceTree === sourceTree)?.[0];
  if (required) assert.equal(name, required, 'This candidate requires its exact reviewed geometry contract');
  if (name === undefined) return null;
  assert.ok(Object.hasOwn(contracts, name), 'Unknown geometry contract');
  const contract = contracts[name];
  assert.equal(sourceTree, contract.sourceTree, 'Geometry contract source tree mismatch');
  assert.equal(mode, 'fixed', 'Geometry experiment requires fixed acceptance');
  assert.ok(Object.hasOwn(contract.rows, viewport), 'Geometry contract viewport required');
  return { name, sourceTree, maxBufferPixels: contract.maxBufferPixels, maxDpr: 1.5,
    ...(contract.contextCreation ? { contextCreation: contract.contextCreation } : {}),
    ...(contract.captures ? { captures: contract.captures } : {}),
    originalQualitySource: { sourceCommit: 'b3f72d6de048941ce7b21c94b13f2896849b01db', sourceTree: '0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8', maxBufferPixels: 2_000_000, maxDpr: 1.5 },
    ...contract.rows[viewport] };
}
function creationFailures(observation, contract) {
  if (!contract?.contextCreation) return [];
  const scene = observation.contexts.filter(context => context.sceneCanvas);
  const proof = scene.length === 1 ? scene[0].creation : null;
  const { multisampled, ...expectedCreation } = contract.contextCreation;
  const fixed = { ...expectedCreation, phase: 'setup', contextType: 'webgl2', defaultFramebufferBound: true, reads: 1 };
  const invalidMultisampling = multisampled && (!Number.isSafeInteger(proof?.samples) || proof.samples < 2 || !Number.isSafeInteger(proof?.sampleBuffers) || proof.sampleBuffers < 1);
  const invalidSourceBinding = multisampled && (scene.length !== 1 || !Number.isSafeInteger(scene[0].id) || scene[0].id < 1 ||
    scene[0].connected !== true || scene[0].lostEvents !== 0 || scene[0].restoredEvents !== 0 ||
    !Number.isSafeInteger(proof?.sequence) || proof?.time < 0 ||
    observation.dimensions.some(d => d.contextId !== scene[0].id) ||
    observation.phases.some((p, i) => p.contextId !== scene[0].id ||
      (p.stable && p.dimensions?.contextId !== scene[0].id) || !Number.isSafeInteger(p.sequence) ||
      (i > 0 && (p.sequence <= observation.phases[i - 1].sequence || p.time < observation.phases[i - 1].time))));
  if (!proof || invalidMultisampling || invalidSourceBinding || Object.entries(fixed).some(([key, value]) => proof[key] !== value) ||
      !Number.isFinite(proof.time) || !Number.isInteger(proof.sequence) || proof.sequence < 1 ||
      !observation.phases.length || observation.phases.some(p => !Number.isFinite(p.time) || !Number.isInteger(p.sequence) || p.time < proof.time || p.sequence <= proof.sequence)) {
    return [multisampled
      ? 'MSAA context creation evidence must prove native requested and returned antialias with integer multisampling in untimed setup before every measured phase'
      : 'MSAA context creation evidence must prove one native no-MSAA default buffer in untimed setup before every measured phase'];
  }
  return [];
}
function captureFailures(pixels, contract) {
  if (!contract?.captures) return [];
  if (JSON.stringify(pixels.map(p => [p?.label, p?.phase])) !== JSON.stringify(contract.captures) || pixels.some(p => p.blank !== false)) {
    return ['Static studio contract requires all 13 original nonblank captures once, in order, in their exact phases'];
  }
  return [];
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
  if (env.R35_EXPECTED_APP_TREE === BRAKE_INDEX_TREE) {
    assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Brake candidate requires reviewed main push');
    for (const marker of ['[stage-dpr-motion]', '[stage-cabin-integration]'])
      assert.ok((env.R35_DPR_COMMIT_MESSAGE ?? '').includes(marker), `Brake candidate requires ${marker}`);
  }
  if ([RENDER_BACKPRESSURE_TREE, RENDER_REPAIR_TREE, CABIN_ENTRY_FUNCTIONAL_TREE, CONTACT_SHADOW_TREE, CAMERA_TERMINAL_TREE].includes(env.R35_EXPECTED_APP_TREE)) {
    assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Pacing candidate requires reviewed main push');
    for (const marker of ['[stage-dpr-motion]', '[stage-cabin-integration]'])
      assert.ok((env.R35_DPR_COMMIT_MESSAGE ?? '').includes(marker), `Pacing candidate requires ${marker}`);
  }
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
  if (request.version === 2) assert.ok(Object.hasOwn(contracts, request.geometryContract), 'Known geometry contract required');
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
  const failures = [...observation.issues, ...geometryFailures(observation, geometry), ...creationFailures(observation, geometry), ...captureFailures(pixels, geometry)];
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
