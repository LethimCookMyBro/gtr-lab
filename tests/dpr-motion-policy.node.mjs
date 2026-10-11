import test from 'node:test';
import assert from 'node:assert/strict';
const policy = await import('../scripts/dpr-motion-policy.mjs');
const approved = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), R35_SOURCE_SHA: 'b'.repeat(40), R35_EXPECTED_APP_TREE: 'c'.repeat(64), R35_ALLOW_DPR_MOTION_PROBE: '1', R35_DPR_MODE: 'fixed', R35_QA_VIEWPORT: 'desktop' };
test('guard needs exact CI origin, explicit opt-in and exact identities', () => {
  assert.equal(policy.validateMotionEnvironment(approved).mode, 'fixed');
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_REPOSITORY: 'fork/gtr-lab', GITHUB_REF: 'refs/heads/other', R35_ALLOW_DPR_MOTION_PROBE: '0', GITHUB_SHA: 'main', R35_SOURCE_SHA: 'main', R35_EXPECTED_APP_TREE: 'HEAD', R35_DPR_MODE: 'live', R35_QA_VIEWPORT: 'tablet' })) assert.throws(() => policy.validateMotionEnvironment({ ...approved, [key]: value }), key);
  assert.throws(() => policy.validateMotionEnvironment({ ...approved, R35_DPR_BASE_URL: 'https://example.com' }), /target/i);
});
test('high-density matrix keeps native DPR and normal motion', () => {
  assert.deepEqual(policy.motionViewports.desktop, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  assert.deepEqual(policy.motionViewports.mobile, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
});
const fixture = () => ({ issues: [], phases: [{ name: 'exterior-orbit', stable: true, contextId: 1, dimensions: { width: 1440, height: 900, cssWidth: 1440, cssHeight: 900, nativeDpr: 2 } }], events: [], contexts: [{ id: 1, sceneCanvas: true, connected: true, lostEvents: 0, restoredEvents: 0 }], dimensions: [{ phase: 'exterior-orbit', contextId: 1, width: 1440, height: 900, cssWidth: 1440, cssHeight: 900, nativeDpr: 2 }] });
test('baseline measures competing DPR while fixed rejects a same-size clearing write', () => {
  const observation = fixture(); observation.events.push({ kind: 'canvas-write', phase: 'exterior-orbit', contextId: 1, property: 'width', before: 1440, after: 1440 });
  const baseline = policy.assessMotionEvidence({ mode: 'baseline', observation, pixels: [] });
  assert.equal(baseline.stableWrites.length, 1); assert.deepEqual(baseline.failures, []);
  assert.ok(policy.assessMotionEvidence({ mode: 'fixed', observation, pixels: [] }).failures.some(x => /write/.test(x)));
});
test('deliberate viewport change is separate, but post-resize churn is a failure', () => {
  const observation = fixture(); observation.phases.push({ name: 'viewport-change', stable: false }); observation.events.push({ kind: 'canvas-write', phase: 'viewport-change', contextId: 1 });
  assert.deepEqual(policy.assessMotionEvidence({ mode: 'fixed', observation, pixels: [] }).failures, []);
  observation.dimensions.push({ ...observation.dimensions[0], width: 1000 });
  assert.ok(policy.assessMotionEvidence({ mode: 'fixed', observation, pixels: [] }).failures.some(x => /dimension/.test(x)));
});
test('fixed requires native <=1.5 density and 2M backing-pixel ceiling', () => {
  const observation = fixture(); observation.dimensions[0].width = 2880; observation.dimensions[0].height = 1800;
  const result = policy.assessMotionEvidence({ mode: 'fixed', observation, pixels: [] });
  assert.ok(result.failures.some(x => /pixel budget/.test(x))); assert.ok(result.failures.some(x => /DPR ceiling/.test(x)));
});
test('blank evidence is recorded for baseline and rejected for fixed; loss and overflow always fail', () => {
  const observation = fixture(); const pixels = [{ label: 'look', blank: true }];
  assert.equal(policy.assessMotionEvidence({ mode: 'baseline', observation, pixels }).blankSamples.length, 1);
  assert.ok(policy.assessMotionEvidence({ mode: 'fixed', observation, pixels }).failures.some(x => /blank/.test(x)));
  observation.contexts[0].lostEvents = 1; observation.issues.push('capacity exceeded');
  assert.equal(policy.assessMotionEvidence({ mode: 'baseline', observation, pixels }).failures.length, 2);
});
test('pixel policy excludes DOM overlays and catches black and nonblack flat clears', () => {
  const rgba = new Uint8Array(100 * 100 * 4); for (let p = 0; p < rgba.length; p += 4) { rgba[p] = 17; rgba[p + 1] = 19; rgba[p + 2] = 22; rgba[p + 3] = 255; }
  assert.equal(policy.summarizeScenePixels({ width: 100, height: 100, data: rgba }, { x: 0, y: 0, width: 100, height: 100 }).blank, true);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 100; x++) rgba[(y * 100 + x) * 4] = x * 2;
  assert.equal(policy.summarizeScenePixels({ width: 100, height: 100, data: rgba }, { x: 0, y: 0, width: 100, height: 100 }).blank, false);
  assert.equal(policy.summarizeScenePixels({ width: 100, height: 100, data: rgba }, { x: 0, y: 0, width: 100, height: 100 }, [{ x: 0, y: 0, width: 100, height: 40 }]).blank, true);
  assert.throws(() => policy.summarizeScenePixels({ width: 100, height: 100, data: rgba }, { x: 0, y: 0, width: 100, height: 100 }, [{ x: 0, y: 0, width: 100, height: 90 }]), /half/);
});
test('fixed cannot pass a stable phase with missing dimension evidence', () => {
  const observation = fixture(); observation.dimensions = [];
  assert.ok(policy.assessMotionEvidence({ mode: 'fixed', observation, pixels: [] }).failures.some(x => /missing buffer dimensions/.test(x)));
});
const request = { version: 1, allow: true, mode: 'baseline', sourceSha: 'b'.repeat(40), sourceTree: 'c'.repeat(64) };
const pushEnv = { ...approved, GITHUB_EVENT_NAME: 'push', R35_DPR_COMMIT_MESSAGE: 'Reviewed CI-only [stage-dpr-motion] [stage-cabin-integration]' };
test('reviewed main-push request needs exact repository/ref, marker and explicit allow', () => {
  assert.equal(typeof policy.resolveMotionRequest, 'function');
  const resolved = policy.resolveMotionRequest(request, pushEnv); assert.equal(resolved.R35_SOURCE_SHA, request.sourceSha); assert.equal(resolved.R35_ALLOW_DPR_MOTION_PROBE, '1');
  for (const env of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'fork/repo' }, { GITHUB_REF: 'refs/heads/fix' }, { GITHUB_EVENT_NAME: 'pull_request' }, { R35_DPR_COMMIT_MESSAGE: 'ordinary push' }]) assert.throws(() => policy.resolveMotionRequest(request, { ...pushEnv, ...env }));
  for (const invalid of [{ allow: false }, { allow: 'true' }, { version: 2 }, { sourceSha: 'main' }, { sourceTree: 'HEAD' }, { mode: 'live' }, { baseUrl: 'https://example.com' }]) assert.throws(() => policy.resolveMotionRequest({ ...request, ...invalid }, pushEnv));
});
test('literal current resolves only in fixed request setup; strict browser driver rejects it', () => {
  assert.equal(typeof policy.resolveMotionRequest, 'function');
  const fixed = policy.resolveMotionRequest({ ...request, mode: 'fixed', sourceSha: 'current' }, pushEnv); assert.equal(fixed.R35_SOURCE_SHA, pushEnv.GITHUB_SHA);
  assert.equal(policy.validateMotionEnvironment({ ...pushEnv, ...fixed }).mode, 'fixed');
  assert.throws(() => policy.validateMotionEnvironment({ ...approved, R35_SOURCE_SHA: 'current' }), /R35_SOURCE_SHA/);
  assert.throws(() => policy.resolveMotionRequest({ ...request, sourceSha: 'current' }, pushEnv), /fixed/);
});
test('the staged request resolves exact reviewed identities without driver wildcards', async () => {
  const { readFile } = await import('node:fs/promises');
  const real = JSON.parse(await readFile(new URL('../qa/dpr-motion-request.json', import.meta.url), 'utf8'));
  const resolved = policy.resolveMotionRequest(real, pushEnv);
  assert.equal(real.allow, true); assert.match(resolved.R35_SOURCE_SHA, /^[a-f0-9]{40}$/);
  assert.equal(resolved.R35_EXPECTED_APP_TREE, real.sourceTree);
  assert.equal(policy.validateMotionEnvironment({ ...pushEnv, ...resolved }).mode, real.mode);
});
test('pointer movement cannot be proven by changing only the overlay layout hash', () => {
  assert.equal(typeof policy.assertPointerMotionPixels, 'function');
  const first = { blank: false, scene: { layout: 'original-mask', sha256: 'same-pixels-layout-a' } };
  const layoutOnlyChange = { blank: false, scene: { layout: 'moved-mask', sha256: 'same-pixels-layout-b' } };
  assert.throws(() => policy.assertPointerMotionPixels(first, layoutOnlyChange), /layout/);
  assert.throws(() => policy.assertPointerMotionPixels(first, first), /changed scene pixels/);
  assert.doesNotThrow(() => policy.assertPointerMotionPixels(first, { blank: false, scene: { layout: 'original-mask', sha256: 'different-pixels-same-layout' } }));
  assert.throws(() => policy.assertPointerMotionPixels(first, { ...first, blank: true }), /blank/);
});
