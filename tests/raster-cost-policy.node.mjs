import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as p from '../scripts/raster-cost-policy.mjs';
import { deriveRasterDriver } from '../scripts/build-raster-cost-driver.mjs';
import { main } from '../scripts/diagnose-raster-cost-trial.mjs';
import { validateTreatmentText } from '../scripts/verify-raster-sources.mjs';
import { sharedAssetBodies } from '../scripts/raster-cost-evidence.mjs';
// Synthetic reviewed-pin fixture only. The on-disk candidate remains deliberately unbound.
const code = (await readFile(new URL('../scripts/raster-cost-policy.mjs', import.meta.url), 'utf8'))
  .replace("from './drained-key-policy.mjs'", `from '${new URL('../scripts/drained-key-policy.mjs', import.meta.url).href}'`)
  .replace(/export const candidate = Object\.freeze\(\{ sha: (?:null|'[a-f0-9]{40}')/, "export const candidate = Object.freeze({ sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'");
const bound = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const hash = s => createHash('sha256').update(s).digest('hex');
const env = trial => ({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40), GITHUB_JOB: 'measure', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', RUNNER_NAME: 'same-runner', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', R35_RASTER_COMMIT_MESSAGE: '[stage-raster-cost]', R35_ALLOW_RASTER_COST: '1', R35_RASTER_TRIAL: String(trial), R35_RASTER_LANE: bound.trialOrder[trial - 1], R35_DRAINED_KEY_SOURCE_SHA: (bound.trialOrder[trial - 1] === 'A' ? bound.baseline : bound.candidate).sha, R35_DRAINED_KEY_SOURCE_TREE: (bound.trialOrder[trial - 1] === 'A' ? bound.baseline : bound.candidate).tree, R35_DRAINED_KEY_APP_ROOT: bound.trialOrder[trial - 1] === 'A' ? 'baseline' : 'candidate' });
const state = lane => ({ live: true, pose: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], projection: [1, 0, 0, 1] }, camera: { preset: 'front', settled: true }, vehicle: { paint: 'silver', environment: 'studio', lights: false }, dimensions: { ...bound.geometryForLane(lane).buffer, pixelRatio: lane === 'A' ? 1.366 : .966, cssWidth: 1440, cssHeight: 744, renderWidth: 1440, renderHeight: 744 } });
const reports = () => bound.trialOrder.map((lane, i) => ({
  trial: i + 1, lane, cleanupConfirmed: true, sourceContract: bound.contractId, sourceCommit: (lane === 'A' ? bound.baseline : bound.candidate).sha, sourceTree: (lane === 'A' ? bound.baseline : bound.candidate).tree, result: 'observed', assessment: { status: 'collected', failures: [] }, harnessCommit: 'a'.repeat(40), runnerIdentity: { hostname: 'one-host', runId: '1', runAttempt: '1', job: 'measure' }, browserVersion: '153.0.8010.12', normalizedBrowserArguments: ['--use-angle=swiftshader'], backend: { glRenderer: 'SwiftShader' }, requestedContextAttributes: { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, contextCreation: { phase: 'setup', contextType: 'webgl2', requestedAntialias: true, antialias: true, samples: 4, sampleBuffers: 1, defaultFramebufferBound: true, reads: 1, time: i, sequence: 1 }, geometry: Array.from({ length: 6 }, () => ({ ...bound.geometryForLane(lane), reducedMotion: false })), gates: Array.from({ length: 4 }, (_, k) => ({ status: 'clean', elapsedMs: 1000, checkpointId: k + 1, attempts: [{ id: k + 1, status: 'signaled', stale: false, fenceCallStartedAt: 1003 }] })), captures: [{ result: 'captured', prefixUnchangedDuringCapture: true, sha256: 'c'.repeat(64), pixels: { blank: false } }], stateSnapshots: Array.from({ length: 4 }, (_, k) => ({ snapshot: state(lane), main: { id: k + 1, at: 1.5, stable: true }, pending: false, outsideRafMethods: {}, outsideRafDrawCalls: 0 })), frameEntryEvidence: [1, 2, 3].map(id => ({ id, entryCleanCheckpoint: true, entryCheckpointId: id })), stateEvidence: { issues: [], nativeFences: [1, 2, 3].map(id => ({ id, draws: [id + 1], previous: null, createdAt: 1.8, positive: { status: 0x911a, at: 400 }, retirement: { reason: 'signaled', at: 401 } })) }, keyPrefixes: [1, 2, 3].map(index => ({ index, classification: 'one-scene-raf-clean-entry-prefix', actualDrawRafs: 1, checkpointId: index, workBeforeKeydown: 0, outsideWorkAfterKeydown: 0, firstPostKeyWork: { cleanCheckpoint: true, inRaf: true }, keydown: { at: 0, cleanCheckpoint: true }, frames: [{ id: index, status: 'signaled', calls: 100, triangles: 1000, callbackStartedAt: 1, callbackEndedAt: 2, fenceCallStartedAt: 2, observedSignaledAt: lane === 'A' ? 1002 : 502, observableLatencyLowerMs: lane === 'A' ? 950 : 450, observableLatencyUpperMs: lane === 'A' ? 1000 : 500 }] })), sharedRuntimeAssets: [{ path: '/model.glb', sha256: 'd'.repeat(64) }, { path: '/env.hdr', sha256: 'e'.repeat(64) }], pageErrors: [], requestFailures: [], console: [],
}));
test('unbound candidate fails closed; on-disk request matches the publication state', async () => {
  const unboundCode = code.replace("sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',", 'sha: null,');
  const unbound = await import(`data:text/javascript;base64,${Buffer.from(unboundCode).toString('base64')}`);
  assert.throws(() => unbound.validateRasterEnvironment(env(1)), /not reviewed\/bound/);
  assert.equal(unbound.compareRasterTrials(reports()).status, 'incomplete');
  const request = JSON.parse(await readFile(new URL('../qa/raster-cost-request.json', import.meta.url), 'utf8'));
  if (!request.allow) { assert.equal(request.allow, false); assert.throws(() => p.resolveRasterRequest(request)); }
  else { assert.equal(request.allow, true); assert.equal(p.resolveRasterRequest(request).R35_RASTER_CANDIDATE_SHA, p.candidate.sha); }
  await assert.rejects(main({}), /CI-only/); // Rejected before app/browser/server imports.
});
test('bound synthetic contract rejects source mixing, arbitrary targets, extra trials and mismatched order', () => {
  for (let t = 1; t <= 4; t++) assert.equal(bound.validateRasterEnvironment(env(t)).lane, bound.trialOrder[t - 1]);
  for (const patch of [{ R35_RASTER_TRIAL: '5' }, { R35_RASTER_LANE: 'B' }, { R35_DRAINED_KEY_SOURCE_SHA: 'current' }, { R35_DRAINED_KEY_SOURCE_TREE: bound.candidate.tree }, { R35_RASTER_BASE_URL: 'https://example.com' }, { R35_DRAINED_KEY_APP_ROOT: '/tmp/other' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_JOB: 'other' }, { RUNNER_OS: 'Windows' }, { DEBUG: 'pw:protocol' }]) assert.throws(() => bound.validateRasterEnvironment({ ...env(1), ...patch }));
});
test('one source constant changes and its 93-file identity is pinned', async () => {
  const a = JSON.parse(await readFile(new URL('../qa/raster-cost-baseline-identity.json', import.meta.url), 'utf8'));
  const b = JSON.parse(await readFile(new URL('../qa/raster-cost-candidate-identity.json', import.meta.url), 'utf8'));
  assert.equal(a.sha256, p.baseline.tree); assert.equal(b.sha256, p.candidate.tree); assert.equal(a.files.length, 93); assert.equal(b.files.length, 93);
  const changed = a.files.filter((f, i) => JSON.stringify(f) !== JSON.stringify(b.files[i]));
  assert.deepEqual(changed.map(f => f.path), ['src/components/three/VehiclePixelDensity.tsx']);
  validateTreatmentText('const MAX_BUFFER_PIXELS = 2_000_000;', 'const MAX_BUFFER_PIXELS = 1_000_000;');
  assert.throws(() => validateTreatmentText('const MAX_BUFFER_PIXELS = 2_000_000;', 'const MAX_BUFFER_PIXELS = 500_000;'));
});
test('exact source-derived driver retains native inputs, unchanged deadlines, genuine capture, and reviewed observer/gates', async () => {
  const original = await readFile(new URL('../scripts/diagnose-drained-key.mjs', import.meta.url));
  const generated = deriveRasterDriver(original);
  assert.equal(generated, await readFile(new URL('../scripts/diagnose-raster-cost-trial.mjs', import.meta.url), 'utf8'));
  assert.throws(() => deriveRasterDriver(Buffer.concat([original, Buffer.from('\n')])));
  assert(generated.indexOf('validateRasterEnvironment(env)') < generated.indexOf('await import('));
  assert.equal((generated.match(/page\.screenshot\(/g) ?? []).length, 1);
  assert.match(generated, /timeout:45000,scale:'css',animations:'allow'/);
  assert.match(generated, /page\.keyboard\.press\('ArrowRight'\)/); assert.match(generated, /index<=limits.keys/);
  assert.match(generated, /observeContextCreation:true/); assert.match(generated, /prefixUnchangedDuringCapture/);
  assert.doesNotMatch(generated, /page\.mouse\.|readPixels|\.finish\(|\.flush\(|setDpr|setFrameloop|captureWithTimeoutRetry/);
  for (const [name, pin] of [['drained-key-observer.mjs', '47d1d82eb315a5e338f2dfdd90d193e7191d1fcf62ca585faae8848fe55b8cc0'], ['drained-key-gates.mjs', '86b7b37fa9ea40cbe5aae73b6c74d67439423345fca335b2324b70332a04068d']]) assert.equal(hash(await readFile(new URL('../scripts/' + name, import.meta.url))), pin);
  assert.deepEqual([p.limits.initialGateMs, p.limits.keyGateMs, p.limits.screenshotMs, p.limits.observerMs, p.limits.keys], [45000, 30000, 45000, 300000, 3]);
});
test('actual pixel counts differ while requested DPR and MSAA stay fixed', () => {
  const [a, b] = ['A', 'B'].map(p.geometryForLane);
  assert.deepEqual(a.viewport, b.viewport); assert.equal(a.nativeDpr, b.nativeDpr); assert.deepEqual(a.canvas, b.canvas);
  assert.equal(a.buffer.width * a.buffer.height, 1998472); assert.equal(b.buffer.width * b.buffer.height, 998738);
  assert.throws(() => p.msaaProof({ ...reports()[0].contextCreation, antialias: false }));
  assert.throws(() => p.msaaProof({ ...reports()[0].contextCreation, samples: 0 }));
});
test('complete ABBA produces six descriptive pairs and no acceptance or FPS claim', () => {
  const r = bound.compareRasterTrials(reports()); assert.deepEqual(r.failures, []); assert.equal(r.status, 'paired-observation');
  assert.equal(r.pairs.length, 6); assert.equal(r.originalAcceptanceChanged, false);
  assert(r.descriptiveMedianInputCompletionRatioBoverA > .5 && r.descriptiveMedianInputCompletionRatioBoverA < .501);
});
test('confound, stale frame, missing screenshot, foreign runner and workload changes fail closed', () => {
  const changes = [r => r.pop(), r => r[2].lane = 'A', r => r[2].runnerIdentity.hostname = 'different', r => r[2].backend.glRenderer = 'Hardware', r => r[2].contextCreation.samples = 2, r => r[2].requestedContextAttributes.alpha = true, r => r[2].cleanupConfirmed = false, r => r[2].stateSnapshots[2].main.at = 10, r => r[2].stateSnapshots[2].pending = true, r => r[2].stateSnapshots[2].snapshot.pose.position[0] = 2, r => r[2].stateSnapshots[1].snapshot.vehicle.paint = 'red', r => r[2].geometry[0].buffer.width = 1, r => r[2].keyPrefixes[1].classification = 'multi-frame-non-isolated', r => r[2].keyPrefixes[1].frames[0].triangles++, r => r[2].captures[0].prefixUnchangedDuringCapture = false, r => r[2].captures = [], r => r[2].sharedRuntimeAssets[0].sha256 = 'f'.repeat(64), r => r[2].assessment.failures.push('unobserved'), r => r[2].stateEvidence.issues.push('owner')];
  for (const change of changes) { const r = reports(); change(r); const result = bound.compareRasterTrials(r); assert.equal(result.status, 'incomplete'); assert.equal(result.descriptiveMedianInputCompletionRatioBoverA, null); }
});
test('loaded assets must have complete hashes and cannot change within a trial', () => {
  const asset = { path: '/texture.png', status: 200, bytes: 99, sha256: 'a'.repeat(64) };
  assert.equal(sharedAssetBodies([asset, asset]).length, 1);
  assert.throws(() => sharedAssetBodies([asset, { ...asset, sha256: 'b'.repeat(64) }]));
  assert.throws(() => sharedAssetBodies([{ ...asset, error: 'timeout' }]));
});
test('bookkeeping-aware attribution preserves raw outside-work labels and requires exact production proof', () => {
  const make = () => {
    const values = reports();
    for (const r of values) {
      r.stateSnapshots.forEach((s, i) => { s.outsideRafMethods = i ? { deleteSync: i } : {}; });
      r.keyPrefixes.forEach(k => { k.classification = 'one-scene-raf-with-outside-work'; k.outsideWorkAfterKeydown = 1; });
    }
    return values;
  };
  const data = make(), result = bound.compareRasterTrials(data);
  assert.deepEqual(result.failures, []); assert.equal(result.status, 'paired-observation');
  assert.equal(data[0].keyPrefixes[0].classification, 'one-scene-raf-with-outside-work');
  assert.equal(result.pairs[0].attributionA.attribution, 'one-draw-raf-plus-matched-signaled-sync-retirement');
  for (const change of [r => r.stateSnapshots[1].outsideRafMethods.flush = 1,
    r => r.stateSnapshots[1].outsideRafMethods.deleteSync = 2,
    r => r.stateSnapshots[1].outsideRafDrawCalls = 1,
    r => r.stateEvidence.nativeFences[0].retirement.reason = 'superseded',
    r => r.stateEvidence.nativeFences[0].positive = null,
    r => r.stateEvidence.nativeFences[0].retirement.at = 1004,
    r => r.stateEvidence.nativeFences.push({ ...r.stateEvidence.nativeFences[0], id: 99 }),
    r => r.frameEntryEvidence[0].entryCleanCheckpoint = false,
    r => r.keyPrefixes[0].workBeforeKeydown = 1]) {
    const values = make(); change(values[0]); assert.equal(bound.compareRasterTrials(values).status, 'incomplete');
  }
});
