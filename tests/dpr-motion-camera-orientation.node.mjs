/** Source-contract integration only. No browser, server or capture accommodation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applicationIdentity } from '../scripts/diagnose-dpr-motion.mjs';
import { resolveMotionRequest, validateMotionEnvironment, assessMotionEvidence, motionModelsForSource } from '../scripts/dpr-motion-policy.mjs';
import { validateBackpressureLifecycleEnvironment } from '../scripts/diagnose-render-backpressure-lifecycle.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Exact reviewed terminal CameraRig orientation and own-demand repair; capture acceptance remains unchanged.
const tree = 'd37a85b85db277453e836dddec2ff0472235aec791a54e1bbdb4124c9eb575b6';
const geometryContract = 'camera-terminal-orientation-2m-msaa-v1';
const legacyTree = '79386e6926c422a81d2fd11a150faefe6513fcb8a89eb15872bc8beeb78d2ee8';
const legacyContract = 'contact-shadow-clamp-stability-2m-msaa-v1';
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

test('historical request and complete 128606e source remain frozen independently of the active candidate', async () => {
  assert.deepEqual(await json('qa/dpr-motion-contact-shadow-request.json'), legacyRequest);
  const historical = await json('qa/fixtures/dpr-motion-contact-shadow-identity.json');
  assert.equal(historical.sha256, legacyTree); assert.equal(hash(JSON.stringify(historical.files)), legacyTree); assert.equal(historical.files.length, 93);
  assert.equal(validateMotionEnvironment(resolve(legacyRequest)).geometry.sourceTree, legacyTree);
  assert.deepEqual(motionModelsForSource(tree), motionModelsForSource(legacyTree));
  assert.deepEqual(motionModelsForSource(tree)[1], { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' });
});

test('active and named requests bind the complete exact terminal-camera runtime identity', async () => {
  assert.deepEqual(await json('qa/dpr-motion-request.json'), request);
  assert.deepEqual(await json('qa/dpr-motion-camera-orientation-request.json'), request);
  const frozen = await json('qa/fixtures/dpr-motion-camera-orientation-identity.json');
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
  const condition = "if: env.R35_DPR_GEOMETRY_CONTRACT == 'render-backpressure-2m-msaa-v1' || env.R35_DPR_GEOMETRY_CONTRACT == 'render-repair-readiness-2m-msaa-v1' || env.R35_DPR_GEOMETRY_CONTRACT == 'cabin-entry-functional-2m-msaa-v1' || env.R35_DPR_GEOMETRY_CONTRACT == 'contact-shadow-clamp-stability-2m-msaa-v1' || env.R35_DPR_GEOMETRY_CONTRACT == 'camera-terminal-orientation-2m-msaa-v1'";
  assert.equal(workflow.split(condition).length - 1, 2);
  for (const command of ['node scripts/diagnose-dpr-motion.mjs', 'node scripts/diagnose-render-backpressure-lifecycle.mjs', 'node --test tests/dpr-motion-*.node.mjs', 'node --test tests/render-backpressure-lifecycle.node.mjs']) assert.ok(workflow.includes(command));
  assert.doesNotMatch(workflow, /continue-on-error|npm test|tests\/server/);
  assert.equal(hash(await read('scripts/diagnose-dpr-motion.mjs')), 'b56d962004c4d0a65e0080eec5f9138c76f18e5b22602ea455bc5f64ecf97110');
  assert.equal(hash(await read('scripts/dpr-motion-observer.mjs')), 'ba4364c76024cd543435fd578b3fdc2def691f935ec30fbf7e3e20f669169aa8');
});

test('runtime repair touches only the separately reviewed source paths and retains every baseline source file', async () => {
  const historical = await json('qa/fixtures/dpr-motion-contact-shadow-identity.json');
  const current = await applicationIdentity(new URL('..', import.meta.url).pathname);
  assert.equal(hash(JSON.stringify(current.files)), tree);
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
  const previous = source.replace(", 'camera-terminal-orientation-2m-msaa-v1'", '');
  assert.equal(hash(previous), '62ab0b738cb308b877ddf2f91e54a6ff0ffc9d9e82d0d40c6c4c0c6aaac9fb60');
});


test('historical controls driver is exact, and native screenshot recovery remains byte-identical', async () => {
  assert.equal(hash(await read('qa/fixtures/diagnose-configurator-controls-6ff2.mjs')), 'c7d436e5d96364b47b8b55015613986a2895b6bc91171d46c043bdc5085cd243');
  const source = String(await read('scripts/diagnose-configurator-controls.mjs'));
  const retry = source.slice(source.indexOf('export async function captureWithTimeoutRetry'), source.indexOf('export async function auditCabinPreviewAvailability'));
  assert.equal(hash(retry), 'ffad5a0043c084139c48b53edae7671aff46b5825c981d3a9a92da8b3b98011f');
});


test('all functional captures, readiness budgets and exact route-return pixel assertions remain byte-identical', async () => {
  const expected = {
  "scripts/capture-cabin-preview.mjs": "8f7bcaa0fe4fd9fe4f2a9bef2debf79f20bded0bb0a40bf57189bf08c5e984d3",
  "scripts/functional-capture-readiness.mjs": "816f8123344a2ab9f98a2469a81758266fc3d60d69545977dae3e19412a2dffb",
  "scripts/cabin-capture-readiness.mjs": "67accafd0ae7aa55620571318f910c607e9eaaf3b792ba6bc947e093cba80056",
  "scripts/diagnose-configurator-controls.mjs": "3261ecc44eb8ca0a473d4047229c832f6ce655ee065806c4060b508e9078ff0d",
  "scripts/capture-environments.mjs": "73b50776dd511f82d7bc6a979f8a8fd9854355ee2b142ac3c74a1bb6eeed014d",
  "scripts/capture-vehicle.mjs": "cae227647bf7b5164b01684369168d2023f0acb59f25d76e42d4f6ad394ca814",
  "scripts/capture-vehicle-materials.mjs": "89b6482085123776db600efa1d2237438b66654a619c39b72b9f07ff5b242505"
};
  for (const [path, expectedHash] of Object.entries(expected)) assert.equal(hash(await read(path)), expectedHash, path);
});


test('shared policy adds only the closed terminal contract and preserves every historical policy byte and source contract', async () => {
  const source = String(await read('scripts/dpr-motion-policy.mjs'));
  const additions = [
    "// Terminal rig orientation and own-demand repair; preserve every native-motion and lifecycle acceptance gate.\nconst CAMERA_TERMINAL_TREE = 'd37a85b85db277453e836dddec2ff0472235aec791a54e1bbdb4124c9eb575b6';\nconst CAMERA_TERMINAL_CONTRACT = 'camera-terminal-orientation-2m-msaa-v1';\n",
    "contracts[CAMERA_TERMINAL_CONTRACT] = { ...contracts[STATIC_STUDIO_CONTRACT], sourceTree: CAMERA_TERMINAL_TREE };\n",
    ', CAMERA_TERMINAL_TREE',
  ];
  let restored = source;
  for (const addition of additions) {
    assert.equal(restored.split(addition).length - 1, 1, 'Only the explicitly reviewed contract addition may normalize');
    restored = restored.replace(addition, '');
  }
  assert.equal(hash(restored), '1e83c090e6ba03a5359566390a785117a699c752e1203808ed89b9236d6e82b6');
  const historical = await import('data:text/javascript;base64,' + Buffer.from(restored).toString('base64'));
  for (const path of [
    'qa/dpr-motion-pixel-budget-1m-request.json', 'qa/dpr-motion-msaa-off-2m-request.json',
    'qa/dpr-motion-static-studio-request.json', 'qa/dpr-motion-brake-index-request.json',
    'qa/dpr-motion-render-backpressure-request.json', 'qa/dpr-motion-render-repair-request.json',
    'qa/dpr-motion-cabin-entry-functional-request.json', 'qa/dpr-motion-contact-shadow-request.json',
  ]) {
    const old = await json(path);
    for (const viewport of ['desktop', 'mobile']) {
      const environment = { ...env, R35_QA_VIEWPORT: viewport };
      const previous = historical.resolveMotionRequest(old, environment);
      const current = resolveMotionRequest(old, environment);
      assert.deepEqual(current, previous, path);
      assert.deepEqual(validateMotionEnvironment({ ...environment, ...current }), historical.validateMotionEnvironment({ ...environment, ...previous }), path);
      assert.deepEqual(motionModelsForSource(old.sourceTree), historical.motionModelsForSource(old.sourceTree), path);
    }
  }
});

test('causal compatibility adds only the reviewed exact runtime binding and preserves all other dependency pins', async () => {
  const historical = {
  "version": 1,
  "allow": true,
  "contract": "r35-causal-observed-effect-v1",
  "sourceSha": "128606e9e744d0b939827b13b9ec9af339e8d95f",
  "sourceTree": "79386e6926c422a81d2fd11a150faefe6513fcb8a89eb15872bc8beeb78d2ee8",
  "exteriorModelSha256": "fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d",
  "files": {
    "evidence/desktop-original-report.json": "200ab65de47c9e9ae62bee6c5dc5e4538b5eb74acbed531945deba85121d73cb",
    "evidence/e9-motion-policy.mjs": "b95b49de16afb14e8b5d32333607a39b90b5f74139601d31f3835dc691feeb19",
    "evidence/mobile-original-report.json": "68903c28cebd161d5d336a7249aaa8b8d28489c746376cbdf7dacf989aa893be",
    "scripts/build-causal-driver.mjs": "9855302a6d08c744a8ba3f7eb3f72281cf8501b19d5e1de49e6c9bbf54c0ff3b",
    "scripts/cabin-resource-observer.mjs": "c35d627df9e75868925c4c6cce53eb2071ac00ef1030d73b2e97513a10e22caf",
    "scripts/causal-cabin-model.mjs": "d2204b1d4e0a5168eed051dd6d964ee7c5dd170fe5cc5448f305c3c894057a16",
    "scripts/causal-capture.mjs": "d5c72d64ac636cb6de6c8249f52ec266b1385468740fbaaad61765e016045efd",
    "scripts/causal-evidence-replay.mjs": "e40a4fb14f9ee50e76c2845e5669b0645fdefd6d4dbf10ed15c805ecebee6030",
    "scripts/causal-motion-observer.mjs": "87627dcac02caa8d2bdf9a1068889a2735852ef2896f89e2d2e186391feaaf1d",
    "scripts/causal-motion-preflight.mjs": "eb0da9fdc01688ae0a86b0d93d6da55a54932839d6ae878872cd63a6acec6a9e",
    "scripts/causal-observed-effect-policy.mjs": "a56c82c76de3f2c5674bf61133fe34e67e511772ceb14c4172d4ca6ecbe2f1a3",
    "scripts/causal-transport-ledger.mjs": "bce978f2068e31be78d81751713bfb5374152282e1c8c3d8088b0fb9d1c2b5c1",
    "scripts/demand-final-request-policy.mjs": "599f0a0abd35b9c845254ea7d29444ba4db3e5e76afdc82b6c0366949014e6fe",
    "scripts/diagnose-causal-motion.mjs": "1e9619d8467558250e3093295d889b548de078f3c9961663fd0f244771577682",
    "scripts/diagnose-configurator-controls.mjs": "3261ecc44eb8ca0a473d4047229c832f6ce655ee065806c4060b508e9078ff0d",
    "scripts/diagnose-dpr-motion.mjs": "b56d962004c4d0a65e0080eec5f9138c76f18e5b22602ea455bc5f64ecf97110",
    "scripts/dpr-motion-observer.mjs": "ba4364c76024cd543435fd578b3fdc2def691f935ec30fbf7e3e20f669169aa8",
    "scripts/dpr-motion-policy.mjs": "1e83c090e6ba03a5359566390a785117a699c752e1203808ed89b9236d6e82b6",
    "scripts/environment-pixel-comparison.mjs": "5994eaa59262f1093ec008e441e1247aaa62b20dca8842f254a4f34545d4d958",
    "scripts/functional-capture-readiness.mjs": "816f8123344a2ab9f98a2469a81758266fc3d60d69545977dae3e19412a2dffb",
    "scripts/vehicle-preview-readiness.mjs": "7005f0acc335ddfd2784a3f3ce6f0f4615447636074bc85e36e30259a0cbd17a"
  }
};
  const current = await json('qa/causal-motion-request.json');
  assert.equal(Object.keys(historical.files).length, 21);
  const updated = structuredClone(historical);
  updated.files['scripts/dpr-motion-policy.mjs'] = hash(await read('scripts/dpr-motion-policy.mjs'));
  updated.files['scripts/causal-motion-preflight.mjs'] = '35215e7b7cbb376c492349c374101055622deb3cc32d991fc1a9e94703349143';
  updated.sourceSha = 'dfdb11f3feb55fcaf5819fc93fe9b269165b4463';
  updated.sourceTree = tree;
  assert.equal(hash(await read('scripts/causal-motion-preflight.mjs')), updated.files['scripts/causal-motion-preflight.mjs']);
  assert.deepEqual(current, updated);
  assert.equal(current.sourceSha, 'dfdb11f3feb55fcaf5819fc93fe9b269165b4463');
  assert.equal(current.sourceTree, tree);
  assert.deepEqual(await json('evidence/causal-128606e/request.json'), historical, 'Published historical request remains byte-exact and distinct');
  for (const [path, expected] of Object.entries(historical.files)) if (!['scripts/dpr-motion-policy.mjs', 'scripts/causal-motion-preflight.mjs'].includes(path)) {
    assert.equal(current.files[path], expected, path);
    assert.equal(hash(await read(path)), expected, path);
  }
});
