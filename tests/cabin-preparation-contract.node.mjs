/** Socket-free negative acceptance and native-readiness regression tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { preparationTree, preparationContract, models, budgets, sha256, readinessWindow, remainingBudget, resolvePreparationRequest, validatePreparationEnvironment,
  assertResidentWorkUnchanged, assertCurrentGeometry, assertPreparationTimeline, assertReadableControls, assertCaseSourceClosure } from '../scripts/cabin-preparation-policy.mjs';
import { installFunctionalCaptureObserver } from '../scripts/cabin-preparation-readiness.generated.mjs';
import { pins, buildPreparationReadiness } from '../scripts/build-cabin-preparation-readiness.mjs';
import { installPreparationObserver, installPreparationDecodeFixture } from '../scripts/cabin-preparation-observer.mjs';
import { main } from '../scripts/diagnose-cabin-preparation.mjs';
const root = new URL('../', import.meta.url), read = path => readFile(new URL(path, root));
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40), R35_QA_VIEWPORT: 'desktop', R35_PREPARATION_LANE: 'feature', R35_PREPARATION_COMMIT_MESSAGE: '[stage-cabin-preparation] [stage-cabin-integration]' };
const request = { version: 1, allow: true, sourceSha: 'current', sourceTree: preparationTree, contract: preparationContract, modelSha256: models[0].sha256 };
const resolved = (changes = {}) => ({ ...env, ...changes, ...resolvePreparationRequest(request, { ...env, ...changes }) });
test('unapproved environment is fail-closed before filesystem traversal or browser/server import', async () => {
  await assert.rejects(main({}), /frozen|GITHUB|Expected/);
  assert.match(preparationTree, /^[a-f0-9]{64}$/);
});
test('only the closed exact-source main push and admitted model are eligible', () => {
  assert.match(preparationTree, /^[a-f0-9]{64}$/);
  assert.equal(validatePreparationEnvironment(resolved()).baseUrl, 'http://127.0.0.1:4178');
  for (const change of [{ version: 2 }, { allow: false }, { sourceSha: 'HEAD' }, { sourceSha: 'a'.repeat(40) }, { sourceTree: 'f'.repeat(64) }, { contract: '__proto__' }, { modelSha256: '8645956f' }, { baseUrl: 'https://example.com' }, { deadlineMs: 180000 }, { modelUrl: '/models/arbitrary.glb' }]) assert.throws(() => resolvePreparationRequest({ ...request, ...change }, env));
  for (const key of Object.keys(request)) { const copy = { ...request }; delete copy[key]; assert.throws(() => resolvePreparationRequest(copy, env)); }
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'another/repo' }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { R35_QA_VIEWPORT: 'tablet' }, { R35_PREPARATION_LANE: 'speed' }, { R35_PREPARATION_COMMIT_MESSAGE: '[stage-cabin-preparation]' }, { R35_PREPARATION_COMMIT_MESSAGE: '[stage-cabin-integration]' }, { R35_BASE_URL: 'http://localhost:4178' }, { R35_CABIN_URL: models[0].path }, { R35_MAX_BUFFER_PIXELS: '1000000' }]) assert.throws(() => resolved(change));
});
test('budgets preserve initial availability, functional/lifecycle and screenshot scope', () => {
  assert.deepEqual(budgets, { initial: 90000, functional: 20000, lifecycle: 30000, screenshot: 45000 });
  assert.throws(() => { budgets.initial = 180000; }, TypeError);
});
test('repeat-entry work fails on any native compilation, image decode or upload and model fetch', () => {
  const names = ['fetches', 'gltfParses', 'bitmapRequests', 'compileShader', 'linkProgram', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D'];
  assert.throws(() => assertResidentWorkUnchanged({}, {}));
  const before = Object.fromEntries(names.map(name => [name, 4])); assertResidentWorkUnchanged(before, { ...before });
  for (const name of names) { assert.throws(() => assertResidentWorkUnchanged(before, { ...before, [name]: 5 }), new RegExp(name)); const missing = { ...before }; delete missing[name]; assert.throws(() => assertResidentWorkUnchanged(before, missing)); }
});
test('current native geometry cannot inherit a stale pre-resize or pre-quality stamp', () => {
  const d = { cssWidth: 1280, cssHeight: 644, renderWidth: 1280, renderHeight: 644 }; const ratio = Math.min(2, 1.5, Math.sqrt(1e6 / (1280 * 644)));
  const state = { dimensions: { ...d, width: Math.floor(1280 * ratio), height: Math.floor(644 * ratio), pixelRatio: ratio } };
  assertCurrentGeometry(state, 'reduced', 2);
  assert.throws(() => assertCurrentGeometry(state, 'standard', 2));
  for (const key of ['width', 'height', 'pixelRatio', 'cssWidth', 'renderWidth']) { const copy = structuredClone(state); copy.dimensions[key] += 10; assert.throws(() => assertCurrentGeometry(copy, 'reduced', 2)); }
});
const timeline = () => {
  const mask = { maskCount: 1, maskOpaque: true, legacyLoading: false }, vehicle = { exterior: true, full: false, proxy: true, cabinSeat: null };
  const dimensions = { width: 100, height: 100, cssWidth: 100, cssHeight: 100, renderWidth: 100, renderHeight: 100, pixelRatio: 1 };
  const driverPose = { position: [.4, 1, -.2], quaternion: [0, 0, 0, 1], projection: Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0) };
  const outside = { vehicle, dimensions, camera: { preset: 'hero' }, pose: { ...driverPose, position: [0, 1, 5] } };
  const observation = { issues: [], events: [
    { owner: 1, kind: 'buffer-replaced', at: 1, ui: mask },
    { owner: 1, kind: 'main', id: 1, at: 2, stable: true, snapshot: { vehicle: { ...vehicle, full: true, proxy: false }, camera: { preset: 'interior' }, dimensions, pose: driverPose }, ui: mask },
    { owner: 1, kind: 'fence', id: 1, draws: [1], at: 3 }, { owner: 1, kind: 'wait', id: 1, status: 0x911c, at: 4 },
    { owner: 1, kind: 'main', id: 2, at: 5, stable: true, snapshot: outside, ui: mask },
    { owner: 1, kind: 'fence', id: 2, draws: [2], at: 6 }, { owner: 1, kind: 'wait', id: 2, status: 0x911c, at: 7 },
  ], dom: [{ ready: true, at: 8, maskCount: 0, legacyLoading: false }] };
  return { observation, certificate: { owner: 1, mainDrawId: 2, fenceId: 2, drainFenceId: 2, nativeStatus: 0x911c, drainNativeStatus: 0x911c, readyAt: 9, reusedUnchanged: false, snapshot: structuredClone(outside) }, options: { quality: 'standard', nativeDpr: 1, driverPose: structuredClone(driverPose) } };
};
test('initial qualification requires masked warmup, real restored main, native completion and ordered UI', () => {
  const { observation, certificate, options } = timeline(); assertPreparationTimeline(observation, certificate, options);
  for (const mutate of [
    v => { v.events = v.events.filter(e => e.kind !== 'buffer-replaced'); },
    v => { v.events = v.events.filter(e => e.kind !== 'main'); },
    v => { v.events = v.events.filter(e => !(e.kind === 'main' && e.id === 1)); },
    v => { v.events.find(e => e.kind === 'main' && e.id === 1).snapshot.pose.position[0] = 42; },
    v => { v.events.find(e => e.kind === 'wait' && e.id === 1).at = 7; },
    v => { v.events.find(e => e.kind === 'fence' && e.id === 2).draws = []; },
    v => { v.events.find(e => e.kind === 'buffer-replaced').ui.maskOpaque = false; },
    v => { v.events.find(e => e.kind === 'buffer-replaced').ui.maskCount = 0; },
    v => { v.events.find(e => e.kind === 'main').ui.legacyLoading = true; },
    v => { v.events.find(e => e.kind === 'main' && e.id === 2).stable = false; },
    v => { v.events.filter(e => e.kind === 'wait').forEach(e => { e.status = 0x911b; }); },
    v => { v.dom[0].at = 4; }, v => { v.dom[0].maskCount = 1; }, v => { v.issues.push('overflow'); },
  ]) { const copy = structuredClone(observation); mutate(copy); assert.throws(() => assertPreparationTimeline(copy, certificate, options)); }
  assert.throws(() => assertPreparationTimeline(observation, { ...certificate, reusedUnchanged: true }, options));
});
test('320px seat and Back readability requires uncut, large-enough, nonoverlapping controls', () => {
  const layout = { width: 320, height: 844, overflow: false, items: ['Driver', 'Passenger', 'Rear seat', 'Back to exterior'].map((text, i) => ({ text, visible: true, x: 8 + (i % 2) * 156, right: 156 + (i % 2) * 156, y: Math.floor(i / 2) * 48, bottom: 44 + Math.floor(i / 2) * 48, width: 148, height: 44, fontSize: 12, scrollWidth: 148, clientWidth: 148 })) };
  assertReadableControls(layout);
  for (const change of [{ right: 321 }, { y: 900, bottom: 944 }, { visible: false }, { text: 'Wrong action' }, { height: 25 }, { fontSize: 10 }, { scrollWidth: 200 }, { x: 170, right: 312 }]) { const copy = structuredClone(layout); Object.assign(copy.items[0], change); assert.throws(() => assertReadableControls(copy)); }
});
function nativeHarness() {
  const canvas = {}, state = { live: true,
    camera: { preset: 'hero', requestId: 1, settled: true, target: [0, 0, 0], destination: [0, 1, 5], targetFov: 34 },
    vehicle: { exterior: true, full: false, proxy: true, cabinSeat: null, lights: false, lamps: [{ role: 'taillights', intensity: 0, emissive: [1, 0, 0] }] },
    pose: { position: [0, 1, 5], quaternion: [0, 0, 0, 1], projection: Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0) },
    dimensions: { width: 100, height: 100, cssWidth: 100, cssHeight: 100, renderWidth: 100, renderHeight: 100, pixelRatio: 1 } };
  let pending = false, time = 1;
  const sandbox = { document: { querySelector: () => canvas, addEventListener() {}, removeEventListener() {} }, devicePixelRatio: 1, performance: { now: () => time } };
  vm.runInNewContext(`(${installFunctionalCaptureObserver.toString()})()`, sandbox);
  const emit = event => sandbox.__gtrFunctionalCaptureObserver({ owner: 1, ...event }), api = sandbox.__gtrFunctionalCapture;
  emit({ kind: 'attach', canvas, context: {}, read: () => state, pending: () => pending });
  const draw = id => emit({ kind: 'main', id, stable: true, snapshot: structuredClone(state) });
  const fence = (id, draws) => emit({ kind: 'fence', id, draws, previous: null });
  const signal = id => { emit({ kind: 'wait', id, status: 0x911c }); emit({ kind: 'retire', id, reason: 'signaled' }); };
  const poll = () => api.poll({ expected: { preset: 'hero', seat: null, lights: false, proxy: true, maxBufferPixels: 2e6 }, deadline: 20000 });
  return { api, state, emit, draw, fence, signal, poll, pending: value => { pending = value; }, time: value => { time = value; } };
}
test('default-buffer warmup explicitly clears an already-completed scene certificate', () => {
  const h = nativeHarness(); h.draw(1); h.fence(1, [1]); h.signal(1); assert.equal(h.poll().mainDrawId, 1);
  h.emit({ kind: 'buffer-replaced' }); assert.equal(h.poll(), null);
  h.fence(2, [1]); h.signal(2); assert.equal(h.poll(), null, 'Replaying an old prefix after warmup cannot restore proof');
  h.draw(2); h.fence(3, [2]); h.signal(3); assert.equal(h.poll().mainDrawId, 2);
});
test('shader-link-only, frame-count-only, offscreen and timeout-expired prefixes cannot qualify', () => {
  const h = nativeHarness(); h.emit({ kind: 'program-ready' }); h.fence(1, []); h.signal(1); assert.equal(h.poll(), null);
  h.draw(1); h.fence(2, [1]); h.emit({ kind: 'wait', id: 2, status: 0x911b }); assert.equal(h.poll(), null);
  h.time(20000); assert.throws(h.poll, /deadline/);
});
test('readiness is armed before initiating entry; already in-flight matching main is stale', () => {
  const h = nativeHarness(); h.draw(1); h.fence(1, [1]); h.api.arm(); h.signal(1); assert.equal(h.poll(), null);
  h.draw(2); h.fence(2, [2]); h.signal(2); assert.equal(h.poll().mainDrawId, 2);
});
test('rendered state mutation, native outstanding fence and owner invalidation remain binding', () => {
  const h = nativeHarness(); h.draw(1); h.fence(1, [1]); h.signal(1); h.state.camera.requestId++; assert.equal(h.poll(), null);
  h.draw(2); h.fence(2, [2]); h.signal(2); h.fence(3, []); assert.equal(h.poll(), null, 'A completed main cannot skip a newer outstanding fence');
  h.signal(3); assert.equal(h.poll().mainDrawId, 2); h.emit({ kind: 'invalid', reason: 'context lost' }); assert.throws(h.poll, /context lost/);
});
test('helper derivation pins all historical source and changes only the reviewed quality adapter', async () => {
  for (const [path, digest] of Object.entries(pins)) assert.equal(sha256(await read(path)), digest, path);
  const output = await buildPreparationReadiness(new URL('../', import.meta.url).pathname);
  assert.equal(output.sha256, '9a3b09e5592058214e65715edc8f3c7039acf335fd9210c5b4428142cac343c6');
  const original = String(await read('scripts/functional-capture-readiness.mjs'));
  assert.ok(original.includes('else if (event.kind === "buffer-replaced") owner.draws.clear()'));
  const driver = String(await read('scripts/diagnose-cabin-preparation.mjs'));
  assert.doesNotMatch(driver, /allowUnchanged:\s*true|continue-on-error|page\.evaluate\([^\n]*\.click\(/);
});

test('ready and drain certificates cannot be relabeled onto unrelated fences or snapshots', () => {
  const { observation, certificate, options } = timeline();
  observation.events.push({ kind: 'fence', owner: 1, id: 3, draws: [], at: 7.2 }, { kind: 'wait', owner: 1, id: 3, status: 0x911c, at: 7.3 });
  assert.throws(() => assertPreparationTimeline(observation, { ...certificate, fenceId: 3 }, options));
  assert.throws(() => assertPreparationTimeline(observation, { ...certificate, drainFenceId: 99 }, options));
  const wrong = structuredClone(certificate); wrong.snapshot.pose.position[0] = 50;
  assert.throws(() => assertPreparationTimeline(observation, wrong, options));
});
test('expired deadlines never regain a one-millisecond success window', () => {
  const window = readinessWindow(20000, 1000); assert.equal(remainingBudget(window, 1000), 20000); assert.equal(remainingBudget(window, 20999), 1);
  for (const at of [21000, 21001, Infinity, NaN, 999]) assert.throws(() => remainingBudget(window, at));
  assert.throws(() => readinessWindow(180000, 0)); assert.throws(() => { window.deadline++; }, TypeError);
});
const networkEvidence = () => ({
  row: { name: 'direct-entry-residency', errors: [], pageErrors: [], requestFailures: [], expectedCancellations: [], expectedFailures: [], observation: { totals: { fetches: 1 } },
    runtimeBodies: [{ path: models[0].path, requestId: 1, startedAt: 1000, status: 200, bytes: models[0].bytes, sha256: models[0].sha256 }],
    network: [{ requestId: 'native-1', wallTime: 1, status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '9798606' }, encodedBodyBytes: 9798606, encodedTotalBytes: 9799000, cached: false }] }, wire: { wireEntityBytes: 9798606 },
});
test('every successful browser model body requires complete exact one-to-one transport evidence', () => {
  const { row, wire } = networkEvidence(); assert.equal(assertCaseSourceClosure(row, wire).verifiedDecodedBodies, 1);
  for (const mutate of [
    r => r.errors.push('Unpinned response origin https://unreviewed.example'), r => { r.network = []; }, r => { delete r.network[0].encodedTotalBytes; },
    r => { r.network[0].cached = true; }, r => { r.network[0].headers['Content-Encoding'] = 'identity'; }, r => { r.network[0].headers['Content-Length'] = '1'; },
    r => { r.runtimeBodies[0].sha256 = 'a'.repeat(64); }, r => { r.runtimeBodies[0].error = 'Protocol error: No resource'; },
    r => { r.runtimeBodies = []; }, r => { r.network.push(structuredClone(r.network[0])); }, r => { r.observation.totals.fetches = 2; },
    r => { r.runtimeBodies.push({ ...r.runtimeBodies[0], requestId: 2 }); },
  ]) { const copy = structuredClone(row); mutate(copy); assert.throws(() => assertCaseSourceClosure(copy, wire)); }
});
test('a cancellation exception is confined to its actual aborted request, never a later return', () => {
  const { row, wire } = networkEvidence(); row.name = 'trusted-route-cancels-fetch'; row.observation.totals.fetches = 2;
  row.runtimeBodies[0].requestId = 2; row.expectedCancellations = [{ requestId: 1, reason: 'explicit trusted navigation' }];
  row.requestFailures = [{ requestId: 1, error: 'net::ERR_ABORTED' }]; row.network.unshift({ requestId: 'native-abort', wallTime: .5, failed: { error: 'net::ERR_ABORTED' } });
  row.runtimeBodies.unshift({ requestId: 1, path: models[0].path, error: 'Protocol error: No resource', status: 200 });
  assertCaseSourceClosure(row, wire);
  const later = structuredClone(row); later.runtimeBodies[1].error = 'Protocol error: No resource'; assert.throws(() => assertCaseSourceClosure(later, wire));
  const unproven = structuredClone(row); unproven.requestFailures = []; assert.throws(() => assertCaseSourceClosure(unproven, wire));
});
function observerHarness(missing) {
  class GL { constructor() { this.canvas = { isConnected: true, matches: () => true, addEventListener() {} }; } isContextLost() { return false; } }
  const methods = ['compileShader', 'linkProgram', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'createBuffer', 'deleteBuffer', 'createProgram', 'deleteProgram', 'createShader', 'deleteShader'];
  for (const name of methods) if (name !== missing) Object.defineProperty(GL.prototype, name, { configurable: true, writable: true, value: function () { if (name.startsWith('create')) return {}; } });
  const sandbox = { WebGL2RenderingContext: GL, document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, MutationObserver: class { observe() {} }, location: { href: 'http://127.0.0.1:4178/configurator/premium', pathname: '/configurator/premium' },
    performance: { now: () => 1, getEntriesByType: () => [] }, fetch() { return Promise.resolve(); }, createImageBitmap() { return Promise.resolve(); }, __gtrFunctionalCaptureObserver() {}, __gtrFunctionalCapture: { snapshot: () => ({}) } };
  vm.createContext(sandbox); vm.runInContext(`(${installPreparationObserver.toString()})({modelPath:'/model.glb',modelJson:'{"asset":"exact"}'})`, sandbox);
  return { GL, sandbox, snapshot: () => JSON.parse(JSON.stringify(sandbox.__r35Preparation.snapshot())) };
}
test('wrong-context native deletion cannot masquerade as live resource retirement', () => {
  const { GL, snapshot } = observerHarness(), a = new GL(), b = new GL();
  const buffer = a.createBuffer(); b.deleteBuffer(buffer); const rejected = snapshot();
  assert.ok(rejected.issues.includes('Cross-context buffer deletion')); assert.equal(rejected.resources[0].deleted, 0);
  a.deleteBuffer(buffer); assert.equal(snapshot().resources[0].deleted, 1);
});
test('native resource create/delete coverage is mandatory, and exact GLB JSON parses are counted', () => {
  assert.ok(observerHarness('deleteShader').snapshot().issues.includes('Missing native method deleteShader'));
  const h = observerHarness(); vm.runInContext('JSON.parse(\'{"asset":"exact"}\')', h.sandbox); assert.equal(h.snapshot().totals.gltfParses, 1);
  vm.runInContext('JSON.parse(\'{"asset":"other"}\')', h.sandbox); assert.equal(h.snapshot().totals.gltfParses, 1);
});
test('decode cancellation fixture identifies and tracks closure of the exact native bitmap object', async () => {
  const source = new Blob(['accepted-image'], { type: 'image/png' }); const digest = sha256(Buffer.from('accepted-image'));
  class Bitmap { width = 2; height = 2; close() {} }
  const bitmap = new Bitmap(), other = new Bitmap();
  const sandbox = { Blob, ImageBitmap: Bitmap, crypto: globalThis.crypto, performance, createImageBitmap: () => Promise.resolve(bitmap) };
  vm.createContext(sandbox); vm.runInContext(`(${installPreparationDecodeFixture.toString()})({images:[{bytes:${source.size},mimeType:'image/png',sha256:'${digest}'}]})`, sandbox);
  sandbox.__r35PreparationDecode.arm(); const delivery = sandbox.createImageBitmap(source);
  for (let i = 0; i < 100 && !sandbox.__r35PreparationDecode.snapshot().pending; i++) await new Promise(done => setTimeout(done, 1));
  const before = sandbox.__r35PreparationDecode.snapshot(); assert.equal(before.pending, 1); assert.equal(before.records[0].sourceSha256, digest); assert.equal(before.records[0].closeCalls, 0);
  sandbox.__r35PreparationDecode.release(); assert.equal(await delivery, bitmap); other.close(); assert.equal(sandbox.__r35PreparationDecode.snapshot().records[0].closeCalls, 0);
  bitmap.close(); const after = sandbox.__r35PreparationDecode.snapshot().records[0]; assert.equal(after.closeCalls, 1); assert.ok(after.closedAt >= after.releasedAt);
});

test('frozen request and complete runtime identity bind only the independently reviewed source', async () => {
  const frozen = JSON.parse(await read('qa/fixtures/cabin-preparation-identity.json'));
  assert.equal(frozen.sha256, preparationTree); assert.equal(sha256(JSON.stringify(frozen.files)), preparationTree); assert.equal(frozen.files.length, 97);
  assert.deepEqual(JSON.parse(await read('qa/cabin-preparation-request.json')), request);
  assert.equal(pins['scripts/prepare-cabin.mjs'], '6a3d1b017accecffb8f6602bebabc3b871aa8a95b3df49d402e16836cfbd1db2');
});
test('new bounded workflow preserves closed staged publication and exact explicit checks', async () => {
  const workflow = String(await read('.github/workflows/cabin-preparation-diagnostic.yml'));
  for (const text of ['contents: read', 'persist-credentials: false', "'[stage-cabin-preparation]'", "'[stage-cabin-integration]'", 'viewport: [desktop, mobile]', 'lane: [feature, lifecycle]', 'node --test tests/cabin-preparation-contract.node.mjs', 'node scripts/diagnose-cabin-preparation.mjs']) assert.ok(workflow.includes(text), text);
  assert.doesNotMatch(workflow, /workflow_dispatch|continue-on-error|npm test|tests\/server|git push|railway up/);
  const driver = String(await read('scripts/diagnose-cabin-preparation.mjs'));
  assert.doesNotMatch(driver, /Math\.max\(1,.*deadline|timeout = budgets\.functional|options\.cancel &&|current\??\.preparation/);
  assert.match(driver, /const entryWindow = readinessWindow\(budgets\.functional\); await armFunctionalCapture\(page\); await tap/);
  assert.match(driver, /assertCaseSourceClosure\(row,/);
});
