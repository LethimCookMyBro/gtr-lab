/** Source-contract integration only. No browser, server or capture accommodation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applicationIdentity } from '../scripts/diagnose-dpr-motion.mjs';
import { resolveMotionRequest, validateMotionEnvironment, assessMotionEvidence, motionModelsForSource } from '../scripts/dpr-motion-policy.mjs';
import { validateBackpressureLifecycleEnvironment } from '../scripts/diagnose-render-backpressure-lifecycle.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Exact reviewed first-cabin-entry camera repair; consumer scripts do not affect runtime identity.
const tree = '387e680e590c1bf1d0f420b7405b7e3bb9ed4d62b7fc46c58129c178e82512f5';
const geometryContract = 'cabin-entry-functional-2m-msaa-v1';
const legacyTree = '814ff47e781f112127596422caad0413c176331f892e9dc5697e10a1c36923c1';
const legacyContract = 'render-repair-readiness-2m-msaa-v1';
const request = { version: 2, allow: true, mode: 'fixed', sourceSha: 'current', sourceTree: tree, geometryContract };
const legacyRequest = { ...request, sourceTree: legacyTree, geometryContract: legacyContract };
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_NAME: 'push', R35_DPR_COMMIT_MESSAGE: '[stage-dpr-motion] [stage-cabin-integration]', R35_QA_VIEWPORT: 'desktop' };
const read = path => readFile(new URL('../' + path, import.meta.url));
const json = async path => JSON.parse(await read(path));
const resolve = (value = request, overrides = {}) => ({ ...env, ...overrides, ...resolveMotionRequest(value, { ...env, ...overrides }) });

test('repair contract is independent, exact-source-bound, fixed-only and requires both reviewed main-push markers', () => {
  const resolved = resolve();
  assert.equal(resolved.R35_SOURCE_SHA, env.GITHUB_SHA);
  assert.equal(validateMotionEnvironment(resolved).geometry.sourceTree, tree);
  for (const change of [{ version: 1 }, { version: 3 }, { allow: false }, { sourceTree: legacyTree }, { sourceTree: 'b'.repeat(64) }, { sourceSha: 'HEAD' }, { mode: 'baseline', sourceSha: 'b'.repeat(40) }, { geometryContract: legacyContract }, { geometryContract: undefined }, { geometryContract: '__proto__' }, { baseUrl: 'https://example.com' }, { captureTimeoutMs: 90_000 }, { maxBufferPixels: 1_000_000 }, { antialias: false }]) assert.throws(() => resolve({ ...request, ...change }));
  for (const key of Object.keys(request)) { const invalid = { ...request }; delete invalid[key]; assert.throws(() => resolve(invalid), key); }
  for (const message of ['', '[stage-dpr-motion]', '[stage-cabin-integration]']) assert.throws(() => resolve(request, { R35_DPR_COMMIT_MESSAGE: message }));
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { R35_QA_VIEWPORT: 'tablet' }, { R35_DPR_BASE_URL: 'http://127.0.0.1:4178' }]) assert.throws(() => resolve(request, change));
  assert.throws(() => validateMotionEnvironment({ ...resolved, R35_DPR_GEOMETRY_CONTRACT: undefined }));
  assert.throws(() => resolve({ ...legacyRequest, geometryContract }));
});

for (const viewport of ['desktop', 'mobile']) test(`${viewport}: complete geometry, quality, phases and all 13 captures equal the historical contract`, () => {
  const old = validateMotionEnvironment(resolve(legacyRequest, { R35_QA_VIEWPORT: viewport })).geometry;
  const current = validateMotionEnvironment(resolve(request, { R35_QA_VIEWPORT: viewport })).geometry;
  assert.deepEqual(current, { ...old, name: geometryContract, sourceTree: tree });
  assert.equal(current.maxBufferPixels, 2_000_000); assert.equal(current.maxDpr, 1.5);
  assert.deepEqual(current.contextCreation, { requestedAntialias: true, antialias: true, multisampled: true });
  assert.equal(current.captures.length, 13);
  for (const name of ['initial', 'resized', 'contextCreation', 'captures']) assert.equal(current[name], old[name], `${name}: same deeply frozen acceptance object`);
  assert.throws(() => { current.initial.width = 1; }, TypeError);
  assert.throws(() => { current.captures.pop(); }, TypeError);
  const phases = ['exterior-idle-before', 'exterior-orbit', 'exterior-controls-rotating', 'exterior-idle-after', 'cabin-entry', 'cabin-look', 'cabin-seat-controls', 'cabin-idle', 'viewport-change', 'resized-cabin-look', 'resized-cabin-idle'];
  const dimensions = phases.filter(name => name !== 'viewport-change').map(phase => ({ phase, contextId: 1, ...(phase.startsWith('resized-') ? current.resized : current.initial) }));
  const observation = { issues: [], events: [{ kind: 'canvas-write', phase: 'viewport-change', contextId: 1 }], contexts: [{ id: 1, sceneCanvas: true, connected: true, lostEvents: 0, restoredEvents: 0, creation: { phase: 'setup', contextType: 'webgl2', requestedAntialias: true, antialias: true, samples: 4, sampleBuffers: 1, defaultFramebufferBound: true, reads: 1, sequence: 1, time: 0 } }], dimensions, phases: phases.map((name, i) => ({ name, stable: name !== 'viewport-change', contextId: 1, time: i + 10, sequence: i + 10, dimensions: dimensions.find(d => d.phase === name) })) };
  const pixels = current.captures.map(([label, phase]) => ({ label, phase, blank: false }));
  const assess = (o = observation, p = pixels) => assessMotionEvidence({ mode: 'fixed', observation: o, pixels: p, sourceTree: tree, geometryContract, viewport });
  assert.deepEqual(assess().failures, []);
  for (const index of pixels.keys()) for (const mutate of [p => { p[index].blank = true; }, p => { delete p[index].blank; }, p => p.splice(index, 1), p => p.push(p[index]), p => { p[index].phase = 'substitute'; }, p => { p[index].label = 'substitute'; }]) {
    const copy = structuredClone(pixels); mutate(copy); assert.ok(assess(observation, copy).failures.length);
  }
  for (const phase of phases) {
    const copy = structuredClone(observation); copy.phases = copy.phases.filter(p => p.name !== phase); assert.ok(assess(copy).failures.length);
  }
  const missing = structuredClone(observation); missing.dimensions = []; assert.ok(assess(missing).failures.length);
  const writes = structuredClone(observation); writes.events.push({ kind: 'canvas-write', phase: 'resized-cabin-look' }); assert.ok(assess(writes).failures.some(value => /write/.test(value)));
});

test('historical request and complete 6ff2 source remain frozen independently of the active candidate', async () => {
  assert.deepEqual(await json('qa/dpr-motion-render-repair-request.json'), legacyRequest);
  const historical = await json('qa/fixtures/dpr-motion-render-repair-identity.json');
  assert.equal(historical.sha256, legacyTree); assert.equal(hash(JSON.stringify(historical.files)), legacyTree); assert.equal(historical.files.length, 93);
  assert.equal(validateMotionEnvironment(resolve(legacyRequest)).geometry.sourceTree, legacyTree);
  assert.deepEqual(motionModelsForSource(tree), motionModelsForSource(legacyTree));
  assert.deepEqual(motionModelsForSource(tree)[1], { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' });
});

test('active request and complete runtime identity match only the new reviewed repair contract', async () => {
  assert.deepEqual(await json('qa/dpr-motion-request.json'), request);
  const frozen = await json('qa/fixtures/dpr-motion-cabin-entry-functional-identity.json');
  assert.equal(frozen.sha256, tree); assert.equal(hash(JSON.stringify(frozen.files)), tree);
  assert.deepEqual(await applicationIdentity(new URL('..', import.meta.url).pathname), frozen);
});

test('both named lifecycle contracts are valid but no unreviewed contract or source alias is admitted', () => {
  for (const approved of [legacyRequest, request]) {
    const resolved = resolve(approved);
    assert.equal(validateBackpressureLifecycleEnvironment(resolved, approved).geometryContract, approved.geometryContract);
    const other = approved === request ? legacyRequest : request;
    assert.throws(() => validateBackpressureLifecycleEnvironment(resolved, other));
    assert.throws(() => validateBackpressureLifecycleEnvironment({ ...resolved, R35_EXPECTED_APP_TREE: other.sourceTree }, approved));
  }
  const brake = { ...request, sourceTree: '6bdc7f056b9a0a58f37271423b020e4930b987ea43764620d95dd5bd2440795e', geometryContract: 'brake-index-lod-2m-msaa-v1' };
  assert.throws(() => validateBackpressureLifecycleEnvironment(resolve(brake), brake), /render-backpressure|lifecycle|Lifecycle/);
});

test('both CI lifecycle steps explicitly admit the repair contract without replacing the native-motion lane', async () => {
  const workflow = String(await read('.github/workflows/dpr-motion-diagnostic.yml'));
  const condition = "if: env.R35_DPR_GEOMETRY_CONTRACT == 'render-backpressure-2m-msaa-v1' || env.R35_DPR_GEOMETRY_CONTRACT == 'render-repair-readiness-2m-msaa-v1' || env.R35_DPR_GEOMETRY_CONTRACT == 'cabin-entry-functional-2m-msaa-v1'";
  assert.equal(workflow.split(condition).length - 1, 2);
  for (const command of ['node scripts/diagnose-dpr-motion.mjs', 'node scripts/diagnose-render-backpressure-lifecycle.mjs', 'node --test tests/dpr-motion-*.node.mjs', 'node --test tests/render-backpressure-lifecycle.node.mjs']) assert.ok(workflow.includes(command));
  assert.doesNotMatch(workflow, /continue-on-error|npm test|tests\/server/);
  assert.equal(hash(await read('scripts/diagnose-dpr-motion.mjs')), 'b56d962004c4d0a65e0080eec5f9138c76f18e5b22602ea455bc5f64ecf97110');
  assert.equal(hash(await read('scripts/dpr-motion-observer.mjs')), 'ba4364c76024cd543435fd578b3fdc2def691f935ec30fbf7e3e20f669169aa8');
});

test('runtime repair touches only the separately reviewed source paths and retains every baseline source file', async () => {
  const historical = await json('qa/fixtures/dpr-motion-render-repair-identity.json');
  const current = await applicationIdentity(new URL('..', import.meta.url).pathname);
  assert.equal(current.sha256, tree); assert.equal(current.files.length, 93);
  const changed = current.files.filter(row => historical.files.find(old => old.path === row.path)?.sha256 !== row.sha256);
  assert.deepEqual(changed.map(row => row.path), ['src/components/three/CameraRig.tsx']);
  for (const old of historical.files) assert.ok(current.files.some(row => row.path === old.path), old.path);
});

test('the same staged source push schedules real cabin and material proof alongside motion and lifecycle', async () => {
  const cabin = String(await read('.github/workflows/cabin-preview-integration.yml'));
  const material = String(await read('.github/workflows/vehicle-preview.yml'));
  for (const workflow of [cabin, material]) {
    assert.match(workflow, /push:\n\s+branches: \[main\]/);
    assert.ok(workflow.includes("- 'src/**'"));
    assert.doesNotMatch(workflow, /continue-on-error/);
  }
  assert.ok(cabin.includes("contains(github.event.head_commit.message, '[stage-cabin-integration]')"));
  assert.ok(cabin.includes('node scripts/capture-cabin-preview.mjs'));
  assert.ok(material.includes('node scripts/capture-vehicle-materials.mjs'));
  for (const path of ['scripts/diagnose-dpr-motion.mjs', 'scripts/dpr-motion-observer.mjs', 'scripts/diagnose-render-backpressure-lifecycle.mjs']) assert.doesNotMatch(String(await read(path)), /functional-capture-readiness|__gtrFunctionalCapture/);
});

test('lifecycle capture behavior is byte-identical after normalizing only the new explicit contract name', async () => {
  const source = String(await read('scripts/diagnose-render-backpressure-lifecycle.mjs'));
  const previous = source.replace(", 'cabin-entry-functional-2m-msaa-v1'", '');
  assert.equal(hash(previous), '375d4aef08e3c2affbf9bf4eed3830ce25ad54c3d371bd4b453f956f34c8d26c');
});


test('historical controls driver is exact, and native screenshot recovery remains byte-identical', async () => {
  assert.equal(hash(await read('qa/fixtures/diagnose-configurator-controls-6ff2.mjs')), 'c7d436e5d96364b47b8b55015613986a2895b6bc91171d46c043bdc5085cd243');
  const source = String(await read('scripts/diagnose-configurator-controls.mjs'));
  const retry = source.slice(source.indexOf('export async function captureWithTimeoutRetry'), source.indexOf('export async function auditCabinPreviewAvailability'));
  assert.equal(hash(retry), 'ffad5a0043c084139c48b53edae7671aff46b5825c981d3a9a92da8b3b98011f');
});
