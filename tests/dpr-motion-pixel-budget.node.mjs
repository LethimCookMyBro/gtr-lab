import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveMotionRequest, validateMotionEnvironment, assessMotionEvidence } from '../scripts/dpr-motion-policy.mjs';
const tree = '60c442f0d379d3c111393eda9337921b6df853ecf5b6e4024f7ce05d958ab930';
const geometryContract = 'pixel-budget-1m-v1';
const request = { version: 2, allow: true, mode: 'fixed', sourceSha: 'current', sourceTree: tree, geometryContract };
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_NAME: 'push', R35_DPR_COMMIT_MESSAGE: '[stage-dpr-motion]', R35_QA_VIEWPORT: 'desktop' };
const rows = {
  desktop: [
    { viewportWidth: 1440, viewportHeight: 900, cssWidth: 1440, cssHeight: 744, nativeDpr: 2, width: 1391, height: 718, attributeWidth: 1391, attributeHeight: 718 },
    { viewportWidth: 1280, viewportHeight: 800, cssWidth: 1280, cssHeight: 644, nativeDpr: 2, width: 1409, height: 709, attributeWidth: 1409, attributeHeight: 709 },
  ],
  mobile: [
    { viewportWidth: 390, viewportHeight: 844, cssWidth: 390, cssHeight: 372, nativeDpr: 3, width: 585, height: 558, attributeWidth: 585, attributeHeight: 558 },
    { viewportWidth: 430, viewportHeight: 900, cssWidth: 430, cssHeight: 428, nativeDpr: 3, width: 645, height: 642, attributeWidth: 645, attributeHeight: 642 },
  ],
};
const phaseNames = ['exterior-idle-before', 'exterior-orbit', 'exterior-controls-rotating', 'exterior-idle-after', 'cabin-entry', 'cabin-look', 'cabin-seat-controls', 'cabin-idle', 'viewport-change', 'resized-cabin-look', 'resized-cabin-idle'];
const fixture = viewport => {
  const dimensions = phaseNames.filter(name => name !== 'viewport-change').map(phase => ({ phase, contextId: 1, ...rows[viewport][phase.startsWith('resized-') ? 1 : 0] }));
  return { issues: [], events: [{ kind: 'canvas-write', phase: 'viewport-change', contextId: 1 }], contexts: [{ id: 1, sceneCanvas: true, connected: true, lostEvents: 0, restoredEvents: 0 }], dimensions,
    phases: phaseNames.map(name => ({ name, stable: name !== 'viewport-change', contextId: 1, dimensions: dimensions.find(d => d.phase === name) })) };
};
const assess = (viewport, observation = fixture(viewport), pixels = []) => assessMotionEvidence({ mode: 'fixed', observation, pixels, geometryContract, sourceTree: tree, viewport });
test('v2 request binds a closed geometry contract to the exact candidate tree and literal resolved commit', () => {
  const resolved = resolveMotionRequest(request, env);
  assert.equal(resolved.R35_SOURCE_SHA, env.GITHUB_SHA);
  assert.equal(resolved.R35_DPR_GEOMETRY_CONTRACT, geometryContract);
  const geometry = validateMotionEnvironment({ ...env, ...resolved }).geometry;
  assert.equal(geometry.maxBufferPixels, 1_000_000);
  assert.deepEqual(geometry.originalQualitySource, { sourceCommit: 'b3f72d6de048941ce7b21c94b13f2896849b01db', sourceTree: '0f78e2163e516652d976adb6ceccad0c8820016798a44b17d620e93d2701a0a8', maxBufferPixels: 2_000_000, maxDpr: 1.5 });
  for (const bad of [{ sourceTree: 'b'.repeat(64) }, { mode: 'baseline', sourceSha: 'b'.repeat(40) }, { geometryContract: 'anything' }, { geometryContract: undefined }, { maxBufferPixels: 500_000 }, { version: 1 }]) assert.throws(() => resolveMotionRequest({ ...request, ...bad }, env));
  const legacyCandidate = { ...request, version: 1 }; delete legacyCandidate.geometryContract;
  assert.throws(() => resolveMotionRequest(legacyCandidate, env), /exact reviewed geometry/);
  const absent = { ...resolved }; delete absent.R35_DPR_GEOMETRY_CONTRACT;
  assert.throws(() => validateMotionEnvironment({ ...env, ...absent }), /exact reviewed geometry/);
  assert.throws(() => validateMotionEnvironment({ ...env, ...resolved, R35_SOURCE_SHA: 'current' }), /R35_SOURCE_SHA/);
});
test('legacy v1 historical identities retain their original acceptance contract', () => {
  const legacy = { version: 1, allow: true, mode: 'fixed', sourceSha: 'b'.repeat(40), sourceTree: 'c'.repeat(64) };
  const resolved = resolveMotionRequest(legacy, env);
  assert.equal(validateMotionEnvironment({ ...env, ...resolved }).geometry, null);
  assert.equal(Object.hasOwn(resolved, 'R35_DPR_GEOMETRY_CONTRACT'), false);
});
for (const viewport of ['desktop', 'mobile']) {
  test(`${viewport}: all exact initial/resized geometry rows pass without bypassing existing acceptance`, () => {
    assert.deepEqual(assess(viewport).failures, []);
    assert.ok(assess(viewport, fixture(viewport), [{ blank: true }]).failures.some(s => /blank/.test(s)));
    const writes = fixture(viewport); writes.events.push({ kind: 'canvas-write', phase: 'exterior-orbit' });
    assert.ok(assess(viewport, writes).failures.some(s => /write/.test(s)));
  });
  for (const phase of ['exterior-orbit', 'resized-cabin-look']) for (const field of Object.keys(rows[viewport][0])) test(`${viewport}/${phase}: rejects wrong or missing ${field}`, () => {
    for (const absent of [false, true]) {
      const observation = fixture(viewport); const sample = observation.dimensions.find(d => d.phase === phase);
      if (absent) delete sample[field]; else sample[field] -= 1;
      assert.ok(assess(viewport, observation).failures.some(s => s.includes(`geometry contract ${field}`)));
    }
  });
  test(`${viewport}: missing/reordered/duplicate phases and unstable post-resize evidence fail`, () => {
    const missing = fixture(viewport); missing.phases.pop(); assert.ok(assess(viewport, missing).failures.length);
    const reordered = fixture(viewport); reordered.phases.reverse(); assert.ok(assess(viewport, reordered).failures.length);
    const duplicate = fixture(viewport); duplicate.phases.push(duplicate.phases[0]); assert.ok(assess(viewport, duplicate).failures.length);
    const unstable = fixture(viewport); unstable.phases.at(-1).stable = false; assert.ok(assess(viewport, unstable).failures.some(s => /stable evidence/.test(s)));
    const unsampled = fixture(viewport); unsampled.dimensions = []; assert.ok(assess(viewport, unsampled).failures.some(s => /dimension evidence missing/.test(s)));
  });
}
test('the original 2M desktop buffer and a smaller-than-reviewed substitute both fail the candidate contract', () => {
  for (const [width, height] of [[1967, 1016], [1000, 500]]) {
    const observation = fixture('desktop'); const sample = observation.dimensions[0]; Object.assign(sample, { width, height, attributeWidth: width, attributeHeight: height });
    assert.ok(assess('desktop', observation).failures.some(s => /geometry contract width/.test(s)));
  }
});
test('staged request and driver use the full unchanged capture path with the additive contract', async () => {
  const actual = JSON.parse(await readFile(new URL('../qa/dpr-motion-pixel-budget-1m-request.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, request);
  const driver = await readFile(new URL('../scripts/diagnose-dpr-motion.mjs', import.meta.url), 'utf8');
  assert.match(driver, /geometryContract: target\.geometryContract, sourceTree: source\.sha256, viewport: target\.name/);
  assert.match(driver, /timeout: 45_000, scale: 'css'/);
  assert.match(driver, /All 13 bounded normal-motion captures are required/);
  assert.match(driver, /reducedMotion: 'no-preference'/);
  const workflow = await readFile(new URL('../.github/workflows/dpr-motion-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /viewport: \[desktop, mobile\]/);
  assert.match(workflow, /timeout-minutes: 16/);
});
