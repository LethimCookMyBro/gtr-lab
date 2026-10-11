/** Socket-free exact-source and adversarial selector evidence tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applicationIdentity } from '../scripts/diagnose-dpr-motion.mjs';
import * as original from '../scripts/dpr-motion-policy.mjs';
import { qualityTree, qualityContract, historicalTree, historicalContract, resolveQualityRequest, validateMotionEnvironment, assessMotionEvidence, qualityDimensions } from '../scripts/selectable-quality-policy.mjs';
import { pins, deriveQualityMotionDriver, deriveQualityReadiness } from '../scripts/build-selectable-quality-drivers.mjs';
import { installQualitySelectionObserver, assertAppliedQuality, classifyQualityResponse, main } from '../scripts/diagnose-selectable-quality.mjs';
const read = path => readFile(new URL('../' + path, import.meta.url));
const json = async path => JSON.parse(await read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const request = await json('qa/selectable-quality-request.json');
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_NAME: 'push', R35_QA_VIEWPORT: 'desktop', R35_DPR_COMMIT_MESSAGE: '[stage-selectable-quality] [stage-dpr-motion] [stage-cabin-integration]' };
const resolve = (r = request, e = env) => ({ ...e, ...resolveQualityRequest(r, e) });
test('new contract is closed, exact-source-bound and main-stage-only before any browser work', async () => {
  const resolved = resolve(); assert.equal(resolved.R35_SOURCE_SHA, env.GITHUB_SHA); assert.equal(validateMotionEnvironment(resolved).geometry.sourceTree, qualityTree);
  for (const key of Object.keys(request)) { const value = { ...request }; delete value[key]; assert.throws(() => resolve(value), key); }
  for (const change of [{ allow: false }, { version: 1 }, { mode: 'baseline' }, { sourceSha: 'HEAD' }, { sourceSha: 'b'.repeat(40) }, { sourceTree: historicalTree }, { geometryContract: historicalContract }, { geometryContract: '__proto__' }, { captureTimeoutMs: 100000 }, { maxBufferPixels: 1 }, { antialias: false }]) assert.throws(() => resolve({ ...request, ...change }));
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_REPOSITORY: 'other/repo' }, { R35_DPR_BASE_URL: 'https://example.com' }, { R35_QA_VIEWPORT: 'tablet' }]) assert.throws(() => resolve(request, { ...env, ...change }));
  for (const marker of ['[stage-selectable-quality]', '[stage-dpr-motion]', '[stage-cabin-integration]']) assert.throws(() => resolve(request, { ...env, R35_DPR_COMMIT_MESSAGE: env.R35_DPR_COMMIT_MESSAGE.replace(marker, '') }));
  await assert.rejects(main({}), /reviewed selectable-quality/);
});
test('complete candidate production identity differs only on the reviewed eight runtime paths', async () => {
  const frozen = await json('qa/fixtures/selectable-quality-identity.json'), legacy = await json('qa/fixtures/dpr-motion-camera-orientation-identity.json');
  assert.equal(frozen.files.length, 93); assert.equal(hash(JSON.stringify(frozen.files)), qualityTree); assert.equal(frozen.sha256, qualityTree);
  assert.deepEqual(await applicationIdentity(new URL('..', import.meta.url).pathname), frozen);
  assert.equal(legacy.sha256, historicalTree); assert.equal(hash(JSON.stringify(legacy.files)), historicalTree);
  assert.deepEqual(frozen.files.map(r => r.path), legacy.files.map(r => r.path));
  assert.deepEqual(frozen.files.filter(row => legacy.files.find(old => old.path === row.path).sha256 !== row.sha256).map(row => row.path), [
    'src/components/configurator/ConfiguratorPanels.tsx', 'src/components/three/VehiclePixelDensity.tsx', 'src/components/three/VehicleScene.tsx', 'src/components/three/types.ts', 'src/components/ui/Drawer.tsx', 'src/pages/ConfiguratorPage.tsx', 'src/stores/configurator.ts', 'src/styles.css',
  ]);
});
for (const viewport of ['desktop', 'mobile']) test(`${viewport}: default Standard retains every historical motion input, geometry and verdict`, () => {
  const now = resolve(request, { ...env, R35_QA_VIEWPORT: viewport });
  const old = { ...now, R35_EXPECTED_APP_TREE: historicalTree, R35_DPR_GEOMETRY_CONTRACT: historicalContract };
  const a = validateMotionEnvironment(now), b = original.validateMotionEnvironment(old);
  assert.deepEqual(a, { ...b, geometryContract: qualityContract, geometry: { ...b.geometry, name: qualityContract, sourceTree: qualityTree } });
  for (const key of ['initial', 'resized', 'contextCreation', 'captures']) assert.equal(a.geometry[key], b.geometry[key]);
  assert.equal(a.geometry.captures.length, 13); assert.equal(a.geometry.maxBufferPixels, 2_000_000); assert.equal(a.geometry.contextCreation.antialias, true);
  const observation = { contexts: [], dimensions: [], phases: [], events: [], issues: [] };
  const value = { mode: 'fixed', observation, pixels: [], viewport };
  const oldVerdict = original.assessMotionEvidence({ ...value, sourceTree: historicalTree, geometryContract: historicalContract });
  const newVerdict = assessMotionEvidence({ ...value, sourceTree: qualityTree, geometryContract: qualityContract });
  assert.deepEqual(newVerdict, oldVerdict); assert.ok(newVerdict.failures.length);
  assert.throws(() => assessMotionEvidence({ ...value, sourceTree: historicalTree, geometryContract: qualityContract }));
});
test('native driver derivation changes exactly one import and never a deadline, input or capture', async () => {
  const bytes = await read('scripts/diagnose-dpr-motion.mjs');
  const derived = deriveQualityMotionDriver(bytes);
  assert.equal(derived.replace("from './selectable-quality-policy.mjs'", "from './dpr-motion-policy.mjs'"), String(bytes));
  assert.equal(hash(derived), '6cd27cabde3e323284c022435203643a590af82d81664d418d3001f5f1a8bb0c');
  assert.throws(() => deriveQualityMotionDriver(Buffer.concat([bytes, Buffer.from('\n')])));
  for (const [path, digest] of Object.entries(pins)) assert.equal(hash(await read(path)), digest, path);
});
test('historical requests, source contracts and failed reports remain independently frozen', async () => {
  assert.deepEqual(await json('qa/dpr-motion-request.json'), await json('qa/dpr-motion-camera-orientation-request.json'));
  assert.equal((await json('qa/dpr-motion-request.json')).sourceTree, historicalTree);
  assert.equal((await json('qa/causal-motion-request.json')).sourceTree, historicalTree);
  const archive = await json('evidence/causal-128606e/manifest.json');
  for (const [path, digest] of Object.entries(archive.files)) assert.equal(hash(await read('evidence/causal-128606e/' + path)), digest);
  for (const viewport of ['desktop', 'mobile']) assert.equal((await json(`evidence/causal-128606e/${viewport}-original-report.json`)).result, 'failed');
  assert.ok(String(await read('tests/dpr-motion-camera-orientation.node.mjs')).includes(`const tree = '${historicalTree}'`));
  assert.ok(String(await read('tests/causal-source-rebind.node.mjs')).includes(`const tree='${historicalTree}'`));
});
test('quality geometry admits real mobile no-op and requires lower desktop backing work', () => {
  for (const [width, height, dpr] of [[390, 372, 3], [430, 428, 3]]) assert.deepEqual(qualityDimensions({ renderWidth: width, renderHeight: height, nativeDpr: dpr }, 'standard'), qualityDimensions({ renderWidth: width, renderHeight: height, nativeDpr: dpr }, 'reduced'));
  const size = { renderWidth: 1440, renderHeight: 744, nativeDpr: 2 };
  assert.deepEqual(qualityDimensions(size, 'standard'), { pixelRatio: Math.sqrt(2_000_000 / (1440 * 744)), width: 1967, height: 1016 });
  assert.deepEqual(qualityDimensions(size, 'reduced'), { pixelRatio: Math.sqrt(1_000_000 / (1440 * 744)), width: 1391, height: 718 });
  assert.throws(() => qualityDimensions(size, 'auto'));
});
const readySource = deriveQualityReadiness(await read('scripts/functional-capture-readiness.mjs'));
const readinessModule = await import('data:text/javascript;base64,' + Buffer.from(readySource).toString('base64'));
function fakeScene(mobile = false) {
  let time = 0, pending = false; const listeners = new Map(), canvas = {};
  const nativeDpr = mobile ? 3 : 2, renderWidth = mobile ? 390 : 1440, renderHeight = mobile ? 372 : 744;
  const state = { live: true, camera: { preset: 'hero', requestId: 0, settled: true, target: [0, 0, 0], destination: [0, 1, 5], targetFov: 34 }, vehicle: { exterior: true, full: false, proxy: false, lights: false, cabinSeat: null, lamps: [{ role: 'taillights', intensity: 0, emissive: [1, 0, 0] }] }, pose: { position: [0, 1, 5], quaternion: [0, 0, 0, 1], projection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, dimensions: { renderWidth, renderHeight, cssWidth: renderWidth, cssHeight: renderHeight, ...qualityDimensions({ renderWidth, renderHeight, nativeDpr }, 'standard') } };
  const world = { devicePixelRatio: nativeDpr, performance: { now: () => time }, document: { querySelector: selector => selector === '.scene-stage canvas' ? canvas : null, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener() {} } };
  vm.runInNewContext(`(${readinessModule.installFunctionalCaptureObserver.toString()})()`, world);
  const emit = event => world.__gtrFunctionalCaptureObserver({ owner: 1, ...event });
  emit({ kind: 'attach', canvas, context: {}, read: () => state, pending: () => pending });
  const api = world.__gtrFunctionalCapture;
  const expected = quality => ({ preset: 'hero', seat: null, lights: false, proxy: false, maxBufferPixels: quality === 'reduced' ? 1_000_000 : 2_000_000 });
  return { world, api, state, nativeDpr, emit, listeners,
    poll: quality => api.poll({ expected: expected(quality), deadline: 1000 }),
    tick: n => { time = n; }, pending: value => { pending = value; },
    complete(id = 1, status = 0x911c) { emit({ kind: 'main', id, stable: true, snapshot: JSON.parse(JSON.stringify(state)) }); emit({ kind: 'fence', id, draws: [id], previous: null }); emit({ kind: 'wait', id, status }); if (status !== 0x911b) emit({ kind: 'retire', id, reason: 'signaled' }); },
  };
}
test('generated completion observer rejects stale Standard geometry for Reduced until a new native-completed draw', () => {
  const h = fakeScene(); h.complete(); assert.ok(h.poll('standard')); h.api.arm();
  assert.equal(h.poll('reduced'), null);
  Object.assign(h.state.dimensions, qualityDimensions({ ...h.state.dimensions, nativeDpr: h.nativeDpr }, 'reduced'));
  assert.equal(h.poll('reduced'), null); h.complete(2, 0x911b); assert.equal(h.poll('reduced'), null);
  h.emit({ kind: 'wait', id: 2, status: 0x911c }); h.emit({ kind: 'retire', id: 2, reason: 'signaled' });
  const certificate = h.poll('reduced'); assert.equal(certificate.mainDrawId, 2); assert.equal(certificate.reusedUnchanged, false); assertAppliedQuality(certificate, 'reduced', 2);
  assert.throws(() => assertAppliedQuality(certificate, 'standard', 2));
});
test('mobile unchanged reuse proves exact completed state, no pending work and no new canvas input', () => {
  const h = fakeScene(true); h.complete(); h.poll('standard'); h.api.arm({ allowUnchanged: true });
  assert.equal(h.poll('reduced').reusedUnchanged, true);
  h.pending(true); assert.equal(h.poll('reduced'), null); h.pending(false);
  h.state.pose.position[0]++; assert.equal(h.poll('reduced'), null); h.state.pose.position[0]--;
  h.listeners.get('keydown')({ target: h.world.document.querySelector('.scene-stage canvas'), isTrusted: true, type: 'keydown', key: 'ArrowRight' }); assert.equal(h.poll('reduced'), null);
  h.complete(2); assert.equal(h.poll('reduced').reusedUnchanged, false);
  h.tick(1000); assert.throws(() => h.poll('reduced'), /deadline/);
});
test('selector observation records trusted UI and pending owner independently without changing completion values', () => {
  const h = fakeScene(); vm.runInNewContext(`(${installQualitySelectionObserver.toString()})()`, h.world);
  const event = { kind: 'attach', owner: 2, canvas: h.world.document.querySelector('.scene-stage canvas'), read: () => h.state, pending: () => true };
  h.world.__gtrFunctionalCaptureObserver(event);
  h.listeners.get('change')({ target: { matches: () => true, value: 'reduced', checked: true }, isTrusted: true });
  const row = h.world.__r35QualitySelection.snapshot().changes[0]; assert.equal(row.trusted, true); assert.equal(row.pending, true); assert.equal(row.owner, 2); assert.equal(row.value, 'reduced'); assert.equal(row.beforeAppliedDimensions.width, 1967);
  assert.equal(h.state.dimensions.width, 1967);
});
test('feature workflow independently retains native failures, original reports, and deployment hold', async () => {
  const workflow = String(await read('.github/workflows/selectable-quality-diagnostic.yml'));
  assert.match(workflow, /fail-fast: false/); assert.equal((workflow.match(/timeout-minutes: 16/g) ?? []).length, 2); assert.match(workflow, /timeout-minutes: 25/); assert.doesNotMatch(workflow, /timeout-minutes: (24|40)/); assert.match(workflow, /lane: \[native-motion, selector-feature\]/); assert.match(workflow, /viewport: \[desktop, mobile\]/);
  assert.ok(workflow.includes('node scripts/diagnose-selectable-quality-motion.generated.mjs')); assert.ok(workflow.includes('node scripts/diagnose-selectable-quality.mjs'));
  assert.match(workflow, /contents: read/); assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /continue-on-error|npm test|tests\/server|railway|deploy:/i);
  const driver = String(await read('scripts/diagnose-selectable-quality.mjs'));
  for (const requirement of ['nativeBefore', 'nativeAfter', 'row.certificate.mainDrawId > changes[0].mainBeforeAction', "assert.deepEqual(restored.scene, initial.scene", "assert.deepEqual(final.scene, standard.scene", "assert.deepEqual(returned.scene, retry.scene", "armCurrent('completion-clear')", "armCurrent('manual-retry')", 'releaseCompletion()', 'assertRetiredFenceContext', 'cleanupConfirmed']) assert.ok(driver.includes(requirement), requirement);
  assert.doesNotMatch(driver, /dispatchEvent|setState\(|readPixels|requestAnimationFrame\(|\.render\(|\.setDpr\(/);
});

test('same-origin GLB-derived blobs are classified separately from exact HTTP body identities', () => {
  const base = 'http://127.0.0.1:4178';
  assert.deepEqual(classifyQualityResponse(base + '/assets/app.js', base), { kind: 'http-asset', path: '/assets/app.js' });
  assert.equal(classifyQualityResponse('blob:' + base + '/image-id', base).kind, 'derived-blob');
  assert.throws(() => classifyQualityResponse('blob:https://example.com/image-id', base));
  assert.throws(() => classifyQualityResponse('https://127.0.0.1:4178/assets/app.js', base));
  assert.throws(() => classifyQualityResponse('data:image/png;base64,abcd', base));
});
