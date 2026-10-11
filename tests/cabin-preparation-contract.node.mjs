/** Socket-free negative acceptance and native-readiness regression tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { installCabinNetworkCapture, networkBuffers, failureBody } from '../scripts/cabin-preparation-network.mjs';
import { preparationTree, preparationContract, models, budgets, sha256, readinessWindow, remainingBudget, resolvePreparationRequest, validatePreparationEnvironment,
  assertResidentWorkUnchanged, assertCurrentGeometry, assertPreparationTimeline, assertReadableControls, assertRestoredExteriorPose, assertCaseSourceClosure } from '../scripts/cabin-preparation-policy.mjs';
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
const modelUrl = 'http://127.0.0.1:4178' + models[0].path;
const networkEvidence = () => ({
  row: { name: 'direct-entry-residency', errors: [], pageErrors: [], requestFailures: [], expectedCancellations: [], expectedFailures: [], observation: { totals: { fetches: 1 } }, runtimeBodies: [], networkObserver: { buffers: { ...networkBuffers }, closed: true, fetchEnableCount: 0, fetchDisableCount: 0 },
    browserModelRequests: [{ requestId: 1, url: modelUrl, status: 200 }],
    modelBodies: [{ path: models[0].path, requestId: 'native-1', source: 'CDP.Network.getResponseBody', status: 200, bytes: models[0].bytes, sha256: models[0].sha256 }],
    network: [{ requestId: 'native-1', sent: true, url: modelUrl, terminal: 'finished', wallTime: 1, status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '9798606' }, encodedBodyBytes: 9798606, encodedTotalBytes: 9799000, cached: false }] }, wire: { wireEntityBytes: 9798606 },
});
test('every successful model body requires complete exact one-to-one native transport evidence', () => {
  const { row, wire } = networkEvidence(); assert.equal(assertCaseSourceClosure(row, wire).verifiedDecodedBodies, 1);
  for (const mutate of [
    r => r.errors.push('Unpinned response origin https://unreviewed.example'), r => { r.network = []; }, r => { delete r.network[0].encodedTotalBytes; },
    r => { r.network[0].cached = true; }, r => { r.network[0].headers['Content-Encoding'] = 'identity'; }, r => { r.network[0].headers['Content-Length'] = '1'; },
    r => { r.modelBodies[0].sha256 = 'a'.repeat(64); }, r => { r.modelBodies[0].error = 'Protocol error: Request content was evicted'; },
    r => { r.modelBodies = []; }, r => { r.network.push(structuredClone(r.network[0])); }, r => { r.observation.totals.fetches = 2; },
    r => { r.modelBodies.push({ ...r.modelBodies[0], requestId: 'native-2' }); }, r => { r.modelBodies[0].requestId = 'orphan'; },
    r => { delete r.network[0].terminal; }, r => { r.browserModelRequests = []; }, r => { r.expectedFailures.push({ requestId: 'native-1', status: 200 }); },
  ]) { const copy = structuredClone(row); mutate(copy); assert.throws(() => assertCaseSourceClosure(copy, wire)); }
});
test('cancellation applies to its exact native abort, never a later returned body', () => {
  const { row, wire } = networkEvidence(); row.name = 'trusted-route-cancels-fetch'; row.observation.totals.fetches = 2;
  row.expectedCancellations = [{ requestId: 'native-abort', fetchId: 'fetch-abort', reason: 'explicit trusted navigation', declaredSequence: 2 }];
  row.browserModelRequests.unshift({ requestId: 2, url: modelUrl, failed: 'net::ERR_ABORTED' });
  row.network.unshift({ requestId: 'native-abort', sent: true, url: modelUrl, wallTime: .5, terminalSequence: 3, terminal: 'failed', failed: { error: 'net::ERR_ABORTED', cancelled: true }, interception: { kind: 'hold', pausedSequence: 1, abortObserved: true, requestId: 'native-abort', fetchId: 'fetch-abort', url: modelUrl } });
  assertCaseSourceClosure(row, wire);
  for (const mutate of [r => { r.modelBodies[0].error = 'Protocol error: No resource'; }, r => { r.expectedCancellations[0].requestId = 'unrelated'; }, r => { r.network[0].failed.cancelled = false; }, r => { r.network[0].failed.error = 'net::ERR_FAILED'; }, r => { r.network[0].encodedTotalBytes = 0; }]) {
    const copy = structuredClone(row); mutate(copy); assert.throws(() => assertCaseSourceClosure(copy, wire));
  }
});
test('identical URLs and timestamps cannot alias native bodies, nor borrow a 503 exemption', () => {
  const { row, wire } = networkEvidence(); row.name = 'native-viewer-retry-retires-residency'; row.observation.totals.fetches = 2;
  row.network.push({ ...row.network[0], requestId: 'native-2' }); row.modelBodies.push({ ...row.modelBodies[0], requestId: 'native-2' }); row.browserModelRequests.push({ ...row.browserModelRequests[0], requestId: 2 });
  assert.equal(assertCaseSourceClosure(row, wire).verifiedDecodedBodies, 2);
  row.modelBodies[1].requestId = 'native-1'; assert.throws(() => assertCaseSourceClosure(row, wire));
  row.modelBodies[1].requestId = 'native-2'; row.name = 'network-failure-exterior-and-retry';
  row.network[0].status = 503; row.network[0].terminalSequence = 3; row.network[0].interception = { kind: 'failure', pausedSequence: 1, requestId: 'native-1', fetchId: 'fetch-1', url: modelUrl, command: { method: 'Fetch.fulfillRequest', fetchId: 'fetch-1', completed: true } };
  Object.assign(row.modelBodies[0], { status: 503, bytes: Buffer.byteLength(failureBody), sha256: sha256(failureBody) }); row.browserModelRequests[0].status = 503;
  row.expectedFailures.push({ requestId: 'native-1', fetchId: 'fetch-1', declaredSequence: 2, status: 503, reason: 'explicit-one-shot-503' }); assertCaseSourceClosure(row, wire);
  row.expectedFailures[0].requestId = 'native-2'; assert.throws(() => assertCaseSourceClosure(row, wire));
});
function observerHarness(missing, ui = {}) {
  class GL { constructor() { this.canvas = { isConnected: true, matches: () => true, addEventListener() {} }; } isContextLost() { return false; } }
  const methods = ['compileShader', 'linkProgram', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'createBuffer', 'deleteBuffer', 'createProgram', 'deleteProgram', 'createShader', 'deleteShader'];
  for (const name of methods) if (name !== missing) Object.defineProperty(GL.prototype, name, { configurable: true, writable: true, value: function () { if (name.startsWith('create')) return {}; } });
  const sandbox = { WebGL2RenderingContext: GL, document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, MutationObserver: class { observe() {} }, location: { href: 'http://127.0.0.1:4178/configurator/premium', pathname: '/configurator/premium' },
    performance: { now: () => 1, getEntriesByType: () => [] }, fetch() { return Promise.resolve(); }, createImageBitmap() { return Promise.resolve(); }, __gtrFunctionalCaptureObserver() {}, __gtrFunctionalCapture: { snapshot: () => ({}) } };
  Object.assign(sandbox.document, ui.document); if (ui.getComputedStyle) sandbox.getComputedStyle = ui.getComputedStyle;
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
  assert.equal(frozen.sha256, preparationTree); assert.equal(sha256(JSON.stringify(frozen.files)), preparationTree); assert.equal(frozen.files.length, 100);
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

async function networkHarness(sendOverride) {
  const cdp = new EventEmitter(), calls = [], row = { errors: [], network: [], modelBodies: [], expectedCancellations: [], expectedFailures: [] };
  cdp.send = async (method, parameters) => { calls.push({ method, parameters }); const value = await sendOverride?.(method, parameters, cdp); return value ?? (method === 'Network.getResponseBody' ? { body: Buffer.from('native-body').toString('base64'), base64Encoded: true } : {}); };
  const api = await installCabinNetworkCapture(cdp, row, { baseUrl: 'http://127.0.0.1:4178', phase: () => 'test' });
  const request = (id = 'native-1') => cdp.emit('Network.requestWillBeSent', { requestId: id, request: { url: modelUrl, method: 'GET' }, wallTime: 123 });
  const pause = (id = 'native-1') => cdp.emit('Fetch.requestPaused', { requestId: 'fetch-' + id, networkId: id, request: { url: modelUrl } });
  const abort = (id = 'native-1', canceled = true, errorText = 'net::ERR_ABORTED') => cdp.emit('Network.loadingFailed', { requestId: id, canceled, errorText });
  const finish = (id = 'native-1', status = 200) => { cdp.emit('Network.responseReceived', { requestId: id, response: { url: modelUrl, status, headers: {} } }); cdp.emit('Network.loadingFinished', { requestId: id, encodedDataLength: 10 }); };
  return { cdp, calls, row, api, request, pause, abort, finish };
}
test('own CDP buffers and retrieval preserve the exact native body ID without refetching', async () => {
  const h = await networkHarness(); assert.deepEqual(h.calls[0], { method: 'Network.enable', parameters: networkBuffers });
  assert.ok(networkBuffers.maxResourceBufferSize > models[0].bytes); assert.ok(networkBuffers.maxTotalBufferSize >= 4 * networkBuffers.maxResourceBufferSize);
  h.request(); h.finish(); await h.api.settle(); assert.deepEqual(h.row.errors, []);
  assert.deepEqual(h.calls.filter(c => c.method === 'Network.getResponseBody'), [{ method: 'Network.getResponseBody', parameters: { requestId: 'native-1' } }]);
  assert.equal(h.row.modelBodies[0].sha256, sha256('native-body'));
});
test('either Fetch/Network event order releases once and leaves later real requests unblocked', async () => {
  for (const order of ['fetch-first', 'network-first']) {
    const h = await networkHarness(), hold = await h.api.hold();
    if (order === 'fetch-first') { h.pause(); h.request(); } else { h.request(); h.pause(); }
    const deadline = readinessWindow(budgets.initial); await hold.wait(deadline); await hold.release(deadline); h.finish(); await h.api.settle();
    assert.deepEqual(h.row.errors, []); assert.equal(h.row.network[0].interception.requestId, 'native-1');
    assert.deepEqual(h.calls.filter(c => c.method === 'Fetch.continueRequest'), [{ method: 'Fetch.continueRequest', parameters: { requestId: 'fetch-native-1' } }]);
    assert.equal(h.calls.some(c => c.method === 'Fetch.disable'), false); await assert.rejects(hold.release(deadline));
    h.request('native-2'); h.pause('native-2'); h.finish('native-2'); await h.api.settle(); assert.equal(h.calls.filter(c => c.method === 'Fetch.continueRequest').length, 2);
  }
});
test('held cancellation requires its exact terminal abort and never resumes it twice', async () => {
  const h = await networkHarness(), hold = await h.api.hold(); h.request(); h.pause(); hold.cancel('trusted navigation'); h.abort();
  await hold.release(readinessWindow(budgets.lifecycle)); await h.api.settle(); assert.equal(h.calls.some(c => c.method === 'Fetch.continueRequest'), false);
  assert.equal(h.row.expectedCancellations[0].requestId, 'native-1');
  for (const [canceled, error] of [[false, 'net::ERR_ABORTED'], [true, 'net::ERR_FAILED']]) {
    const invalid = await networkHarness(), held = await invalid.api.hold(); invalid.request(); invalid.pause(); held.cancel('trusted navigation'); invalid.abort('native-1', canceled, error); await assert.rejects(held.release(readinessWindow(budgets.lifecycle)));
  }
});
test('a rejected continuation is accepted only with the same predeclared native abort', async () => {
  const h = await networkHarness((method, _parameters, cdp) => { if (method === 'Fetch.continueRequest') { cdp.emit('Network.loadingFailed', { requestId: 'native-1', canceled: true, errorText: 'net::ERR_ABORTED' }); throw new Error('Invalid interception'); } });
  const hold = await h.api.hold(); h.request(); h.pause(); hold.cancel('trusted navigation'); await hold.release(readinessWindow(budgets.lifecycle)); await h.api.settle(); assert.deepEqual(h.row.errors, []);
  const bad = await networkHarness(method => { if (method === 'Fetch.continueRequest') throw new Error('Route is already handled'); });
  const held = await bad.api.hold(); bad.request(); bad.pause(); await assert.rejects(held.release(readinessWindow(budgets.initial)), /already handled/);
});
test('body eviction, duplicate terminal events and orphan Fetch identities stay visible failures', async () => {
  const h = await networkHarness(method => { if (method === 'Network.getResponseBody') throw new Error('Request content was evicted'); }); h.request(); h.finish(); await h.api.settle();
  assert.match(h.row.modelBodies[0].error, /evicted/); assert.equal(h.row.errors.length, 1);
  const duplicate = await networkHarness(); duplicate.request(); duplicate.request(); duplicate.finish(); duplicate.finish(); await duplicate.api.settle(); assert.equal(duplicate.row.errors.length, 3);
  const orphan = await networkHarness(); const hold = await orphan.api.hold(); orphan.pause(); await hold.release(readinessWindow(budgets.initial)); await assert.rejects(orphan.api.settle(), /Network request receipt/);
});
test('one-shot fault fulfills only the declared native ID, then continues the retry', async () => {
  const h = await networkHarness(); await h.api.failOnce(); h.request(); h.pause(); await new Promise(setImmediate); h.finish('native-1', 503); await h.api.settle();
  assert.deepEqual(h.row.errors, []); assert.equal(h.row.expectedFailures[0].requestId, 'native-1');
  assert.equal(h.calls.filter(c => c.method === 'Fetch.fulfillRequest').length, 1); h.request('native-2'); h.pause('native-2'); h.finish('native-2'); await h.api.settle();
  assert.deepEqual(h.calls.filter(c => c.method === 'Fetch.continueRequest').map(c => c.parameters.requestId), ['fetch-native-2']);
});
test('legacy strip detection excludes only the indicator owned by the active unified loader', () => {
  const mask = { textContent: 'Preparing exterior and interior', getBoundingClientRect: () => ({ x: 0, y: 0, right: 100, bottom: 100, width: 100, height: 100 }) };
  let activePhase = 'loading', inMask = true, inFooter = false;
  const indicator = { closest: selector => selector === '.scene-loading' ? (inMask ? mask : null) : (inFooter ? {} : null) };
  const h = observerHarness(undefined, { document: { querySelectorAll: selector => selector === '.scene-loading' ? [mask] : selector === '.cabin-load-status, .cabin-load-indeterminate' ? [indicator] : [], querySelector: selector => selector === 'main[data-cabin-preparation]' ? { getAttribute: name => name === 'data-cabin-preparation' ? activePhase : null } : null }, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', backgroundColor: 'rgb(0, 0, 0)' }) });
  assert.equal(h.snapshot().ui.legacyLoading, false);
  inMask = false; assert.equal(h.snapshot().ui.legacyLoading, true);
  inMask = true; inFooter = true; assert.equal(h.snapshot().ui.legacyLoading, true);
  inFooter = false; activePhase = 'ready'; assert.equal(h.snapshot().ui.legacyLoading, true);
});

test('interception disables exactly once only after all declared holds settle', async () => {
  const h = await networkHarness(), hold = await h.api.hold(); h.request(); h.pause(); await assert.rejects(h.api.close(), /Unreleased/);
  await hold.release(readinessWindow(budgets.initial)); h.finish(); await h.api.settle(); await h.api.close();
  assert.equal(h.calls.filter(c => c.method === 'Fetch.disable').length, 1); assert.equal(h.row.networkObserver.closed, true);
  assert.equal(h.row.network[0].interception.command.completed, true); await assert.rejects(h.api.close());
});

test('a pre-existing native abort cannot be relabeled as an upcoming trusted cancellation', async () => {
  const h = await networkHarness(), hold = await h.api.hold(); h.request(); h.pause(); h.abort();
  assert.throws(() => hold.cancel('trusted navigation'), /before any native terminal/); assert.deepEqual(h.row.expectedCancellations, []);
  const { row, wire } = networkEvidence(); row.name = 'trusted-route-cancels-fetch'; row.observation.totals.fetches = 2;
  row.network.unshift({ requestId: 'native-abort', sent: true, url: modelUrl, wallTime: .5, terminalSequence: 2, terminal: 'failed', failed: { error: 'net::ERR_ABORTED', cancelled: true }, interception: { kind: 'hold', pausedSequence: 1, abortObserved: true, requestId: 'native-abort', fetchId: 'fetch-abort', url: modelUrl } });
  row.expectedCancellations.push({ requestId: 'native-abort', fetchId: 'fetch-abort', declaredSequence: 3 }); row.browserModelRequests.unshift({ requestId: 2, url: modelUrl, failed: 'net::ERR_ABORTED' });
  assert.throws(() => assertCaseSourceClosure(row, wire), /declaration must precede/);
});

test('exterior restoration admits only oracle-scale floating roundoff and keeps pixel equality exact', async () => {
  const expected = { position: [5.215500000000001, 2.1199500000000002, 6.2219999999999995], quaternion: [-.08013820504802704, .3405368084800212, .02914489763511814, .9363563024318041], projection: Array.from({length:16}, (_,i) => i%5===0 ? 1 : 0) };
  const roundoff = structuredClone(expected); roundoff.position[0] = 5.215500000000003; roundoff.position[2] = 6.222000000000002; roundoff.quaternion[1] = .34053680848002127;
  assertRestoredExteriorPose(roundoff, expected); assertRestoredExteriorPose({ ...roundoff, quaternion: roundoff.quaternion.map(v=>-v) }, expected);
  for (const name of ['position','quaternion','projection']) {
    const wrong = structuredClone(expected); wrong[name][0] += 2e-8; assert.throws(() => assertRestoredExteriorPose(wrong, expected));
    const invalid = structuredClone(expected); invalid[name][0] = NaN; assert.throws(() => assertRestoredExteriorPose(invalid, expected));
    const truncated = structuredClone(expected); truncated[name].pop(); assert.throws(() => assertRestoredExteriorPose(truncated, expected));
  }
  const driver = String(await read('scripts/diagnose-cabin-preparation.mjs'));
  assert.ok(driver.includes('assertRestoredExteriorPose(restored.certificate.snapshot.pose, initial.certificate.snapshot.pose); assert.deepEqual(restored.scene, initial.scene);'));
});

test('physical pose comparison rejects sparse/coercible tuples before quaternion sign equivalence', () => {
  const valid = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], projection: Array(16).fill(0) };
  for (const name of ['position', 'quaternion', 'projection']) for (const side of ['actual', 'expected']) {
    const pair = { actual: structuredClone(valid), expected: structuredClone(valid) }; pair[side][name] = Array(valid[name].length);
    assert.throws(() => assertRestoredExteriorPose(pair.actual, pair.expected));
    pair[side][name] = structuredClone(valid[name]); delete pair[side][name][0]; assert.throws(() => assertRestoredExteriorPose(pair.actual, pair.expected));
  }
  for (const malformed of [['0','0','0','1'], [null,null,null,1], [undefined,0,0,1], [0,0,0,Infinity]]) {
    for (const sign of [1,-1]) assert.throws(() => assertRestoredExteriorPose({ ...valid, quaternion: [0,0,0,sign] }, { ...valid, quaternion: malformed }));
  }
});

test('cancelled-route return targets the visible Models-list Premium link, not a hidden header CTA', async () => {
  const driver = String(await read('scripts/diagnose-cabin-preparation.mjs'));
  const start = driver.indexOf("await runCase('trusted-route-cancels-fetch'");
  const end = driver.indexOf("await runCase('trusted-model-cancels-native-decode-delivery'", start);
  const routeCase = driver.slice(start, end);
  assert.ok(routeCase.includes("const premiumLink = h.page.locator('.models-page .model-bands').getByRole('link', { name: 'Explore GT-R Premium', exact: true });"));
  assert.ok(routeCase.includes("await expect(premiumLink).toHaveAttribute('href', '/configurator/premium');"));
  assert.ok(routeCase.includes('await h.tap(premiumLink); await h.ready(returnedDeadline);'));
  assert.ok(routeCase.indexOf('const returnedDeadline = readinessWindow(budgets.initial)') < routeCase.indexOf('const premiumLink'));
  assert.doesNotMatch(routeCase, /\.first\(\)|force:\s*true|page\.goto|evaluate\([^\n]*click/);
});

test('photographic NISMO boundary requires its actual disclosure and disabled Interior without weakening residency checks', async () => {
  const driver = String(await read('scripts/diagnose-cabin-preparation.mjs'));
  const boundary = driver.slice(driver.indexOf("await runCase('savedata-and-nonpremium-boundaries'"));
  assert.ok(boundary.includes("getByText('Camera controls activate when this model’s licensed 3D asset is available.', { exact: true })).toBeVisible()"));
  assert.ok(boundary.includes("getByRole('button', { name: 'Interior Detailed cabin required', exact: true })).toBeDisabled()"));
  assert.ok(boundary.includes('assert.equal(home.totals.fetches, 0)'));
  assert.ok(boundary.includes('navigator.connection.saveData), true)'));
  assert.ok(boundary.includes('assert.equal((await h.snapshot()).totals.fetches, 0); await expect(h.canvas).toHaveCount(0)'));
  assert.ok(boundary.includes("const deadline = readinessWindow(budgets.initial); await h.switchModel('premium'); await h.ready(deadline)"));
  assert.ok(boundary.includes('assert.equal(observed.totals.fetches, 1)'));
  assert.doesNotMatch(boundary, /Interior is unavailable|timeout:\s*90000|force:\s*true/);
});

test('mobile containment binds exact viewport, stage and native backing without accepting clipped controls', async () => {
  const { assertMobileContainment } = await import('../scripts/cabin-preparation-policy.mjs');
  const fixture = width => {
    const rect = (x, y, w, h) => ({ x, y, right: x + w, bottom: y + h, width: w, height: h, visible: true });
    const layout = { width, height: 844, overflow: false, header: rect(0, 0, width, 230), headerRow: rect(0, 0, width, 77), stage: rect(0, 230, width, 302), canvas: rect(0, 230, width, 302), backingWidth: width * 1.5, backingHeight: 453,
      headerControls: ['Back to models', 'GT-R LAB home', 'Model detail'].map((text, i) => ({ ...rect(10 + i * 100, 20, 90, 30), text, fontSize: 10, scrollWidth: 90, clientWidth: 90 })),
      items: ['Driver', 'Passenger', 'Rear seat', 'Back to exterior'].map((text, i) => ({ ...rect(8 + (i % 2) * 156, 700 + Math.floor(i / 2) * 48, 148, 44), text, fontSize: 12, scrollWidth: 148, clientWidth: 148 })) };
    const certificate = { owner: 1, nativeStatus: 0x911c, reusedUnchanged: false, snapshot: { dimensions: { cssWidth: width, cssHeight: 302, renderWidth: width, renderHeight: 302, width: width * 1.5, height: 453 } } };
    return { layout, certificate, viewport: { width, height: 844 } };
  };
  for (const width of [390, 320, 390]) { const { layout, certificate, viewport } = fixture(width); assertMobileContainment(layout, certificate, viewport); }
  for (const mutate of [
    r => { r.layout.stage.width = r.layout.stage.right = 390; r.layout.canvas.width = r.layout.canvas.right = 390; },
    r => { r.layout.header.width = r.layout.header.right = 390; }, r => { r.layout.headerRow.width = r.layout.headerRow.right = 390; },
    r => { delete r.layout.stage; }, r => { r.layout.canvas.x = NaN; }, r => { r.layout.header.y = '0'; },
    r => { r.layout.header.visible = false; }, r => { r.layout.canvas.y++; }, r => { r.layout.canvas.height++; },
    r => { r.layout.backingWidth = 585; }, r => { r.certificate.snapshot.dimensions.renderWidth = 390; },
    r => { r.certificate.nativeStatus = 0x911b; }, r => { r.certificate.owner = null; }, r => { r.certificate.reusedUnchanged = true; },
    r => { r.layout.headerControls.pop(); }, r => { r.layout.headerControls[0].text = 'Wrong link'; },
    r => { r.layout.headerControls[0].scrollWidth = 1000; }, r => { r.layout.headerControls[0].scrollWidth = NaN; },
    r => { delete r.layout.headerControls[0].scrollWidth; }, r => { r.layout.headerControls[0].fontSize = 0; }, r => { r.layout.headerControls[0].clientWidth = '90'; },
    r => { r.layout.headerControls[2].right = 350; r.layout.headerControls[2].width = 140; },
    r => { r.layout.headerControls[1].x = 20; r.layout.headerControls[1].right = 110; },
    r => { r.layout.headerControls[0].bottom = 100; r.layout.headerControls[0].height = 80; },
    r => { r.layout.items[0].visible = false; }, r => { r.layout.width = 390; }, r => { r.layout.overflow = true; },
  ]) { const evidence = fixture(320); mutate(evidence); assert.throws(() => assertMobileContainment(evidence.layout, evidence.certificate, evidence.viewport)); }
});

test('mobile round trip retains original deadlines, same completed state, owner, residency and exact restored scene', async () => {
  const source = (await read('scripts/diagnose-cabin-preparation.mjs')).toString();
  assert.match(source, /for \(const width of \[320, 390\]\) \{[\s\S]*?resizeWindow = readinessWindow\(budgets.functional\);[\s\S]*?await armFunctionalCapture\(page\); await page.setViewportSize\(viewport\)/);
  assert.match(source, /const layoutBefore = mobileViewport && await containment\(\);[\s\S]*?await page.screenshot[\s\S]*?const layoutAfter = mobileViewport && await containment\(\);[\s\S]*?await verifyFunctionalCapture\(page\)/);
  for (const expression of ['assert.deepEqual(layoutAfter, layoutBefore', 'assertMobileContainment(layoutAfter, certificate, mobileViewport)', 'assert.equal(resized.certificate.owner, owner)', 'assert.deepEqual(observed.ui.preparation, resident.ui.preparation)', 'assert.deepEqual(observed.contexts, resident.contexts)', 'assert.deepEqual(observed.resources, resident.resources)', 'assertResidentWorkUnchanged(resident.totals, observed.totals)', 'assert.deepEqual(cabinResourceCohort(resourceMark, await resources(), images), residentCohort)', 'assert.deepEqual(resized.scene, repeat.scene)', 'assert.deepEqual(restored.scene, initial.scene)']) assert.ok(source.includes(expression), expression);
  assert.match(source, /row.captures.length < 12/); assert.match(source, /timeout: budgets.screenshot/);
});

test('explicit Reduced comparison is isolated to one desktop feature cell and fixed native backing', async () => {
  const { assertDesktopFeatureGeometry } = await import('../scripts/cabin-preparation-policy.mjs');
  assert.equal(validatePreparationEnvironment(resolved()).quality, 'standard');
  assert.equal(validatePreparationEnvironment(resolved({ R35_PREPARATION_QUALITY: 'standard' })).quality, 'standard');
  assert.equal(validatePreparationEnvironment(resolved({ R35_PREPARATION_QUALITY: 'reduced' })).quality, 'reduced');
  for (const change of [{ R35_PREPARATION_QUALITY: 'auto' }, { R35_PREPARATION_QUALITY: '' }, { R35_PREPARATION_QUALITY: 'reduced', R35_QA_VIEWPORT: 'mobile' }, { R35_PREPARATION_QUALITY: 'reduced', R35_PREPARATION_LANE: 'lifecycle' }]) assert.throws(() => resolved(change));
  for (const quality of ['standard', 'reduced']) {
    const ratio = Math.sqrt((quality === 'standard' ? 2e6 : 1e6) / (1440 * 744));
    const snapshot = { dimensions: { cssWidth: 1440, cssHeight: 744, renderWidth: 1440, renderHeight: 744, pixelRatio: ratio, width: Math.floor(1440 * ratio), height: Math.floor(744 * ratio) } };
    assertDesktopFeatureGeometry(snapshot, quality);
    assert.throws(() => assertDesktopFeatureGeometry(snapshot, quality === 'standard' ? 'reduced' : 'standard'));
    for (const key of Object.keys(snapshot.dimensions)) { const copy = structuredClone(snapshot); copy.dimensions[key] -= 1; assert.throws(() => assertDesktopFeatureGeometry(copy, quality)); }
    const smaller = { dimensions: { cssWidth: 1280, renderWidth: 1280, cssHeight: 720, renderHeight: 720, pixelRatio: 1.5, width: 1920, height: 1080 } };
    assert.throws(() => assertDesktopFeatureGeometry(smaller, quality));
  }
});

test('desktop quality comparison selects the same explicit radio step before releasing the original fetch hold', async () => {
  const source = (await read('scripts/diagnose-cabin-preparation.mjs')).toString(), workflow = (await read('.github/workflows/cabin-preparation-diagnostic.yml')).toString();
  assert.match(workflow, /fail-fast: false/); assert.match(workflow, /viewport: \[desktop, mobile\]\s+lane: \[feature, lifecycle\]\s+quality: \[standard\]\s+include:\s+- viewport: desktop\s+lane: feature\s+quality: reduced/);
  assert.match(workflow, /R35_PREPARATION_QUALITY: \$\{\{ matrix.quality \}\}/); assert.match(workflow, /name: cabin-preparation-\$\{\{ matrix.viewport \}\}-\$\{\{ matrix.lane \}\}-\$\{\{ matrix.quality \}\}/);
  assert.match(source, /if \(target.name === 'desktop'\) \{\s+await open\('Environment'\); const radio = dialog.locator\(`input\[name="render-quality"\]\[value="\$\{target.quality\}"\]`\);\s+await tap\(radio\); await expect\(radio\).toBeChecked\(\); h.setQuality\(target.quality\); await close\(\);/);
  assert.match(source, /label: 'explicit-quality-before-preparation'[\s\S]*?finally \{ await hold.release\(deadline\); \}[\s\S]*?await h.ready\(deadline\)/);
  assert.ok(source.includes("target.name + '-' + target.lane + (target.quality === 'reduced' ? '-reduced' : '')"));
  assert.ok(source.includes('requestedQuality: target.quality')); assert.ok(source.includes('assertDesktopFeatureGeometry(certificate.snapshot, target.quality)'));
  assert.match(source, /const entryWindow = readinessWindow\(budgets.functional\); await armFunctionalCapture\(page\); await tap/);
});
