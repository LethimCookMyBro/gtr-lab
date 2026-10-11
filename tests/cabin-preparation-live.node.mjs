/** Private/socket-free acceptance for the public exact-source adaptation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { EventEmitter } from 'node:events';
import * as policy from '../scripts/cabin-preparation-policy.mjs';
import * as driver from '../scripts/diagnose-cabin-preparation.mjs';
import { installCabinNetworkCapture } from '../scripts/cabin-preparation-network.mjs';
const root = new URL('../', import.meta.url), read = path => readFile(new URL(path, root));
const origin = 'https://gtr-lab-production.up.railway.app';
const token = '[release-cabin-preparation-ao-static-faces]';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40), R35_QA_VIEWPORT: 'desktop', R35_PREPARATION_LANE: 'feature', R35_PREPARATION_MODE: 'live', R35_ALLOW_LIVE_PREPARATION: '1', R35_PREPARATION_COMMIT_MESSAGE: token };
const request = { version: 1, allow: true, sourceSha: 'current', sourceTree: policy.preparationTree, contract: policy.preparationContract, modelSha256: policy.models[0].sha256 };
const resolved = (changes = {}) => { const candidate = { ...env, ...changes }; return { ...candidate, ...policy.resolvePreparationRequest(request, candidate) }; };
const marker = () => ({ version: 1, allow: true, release: token, stagedSource: '2f660090d3ae04549e705e0411dd7083f0626a95', sourceTree: policy.preparationTree, contract: policy.preparationContract,
  modelSha256: policy.models[0].sha256, modelBytes: policy.models[0].bytes, modelGzipSha256: policy.cabinWire.sha256, modelGzipBytes: policy.cabinWire.bytes });

test('only explicit live main pushes resolve to the one immutable public origin', () => {
  const target = policy.validatePreparationEnvironment(resolved());
  assert.equal(target.mode, 'live'); assert.equal(target.baseUrl, origin);
  for (const change of [{ R35_ALLOW_LIVE_PREPARATION: undefined }, { R35_PREPARATION_MODE: 'preview' }, { R35_PREPARATION_MODE: 'staged' }, { GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REPOSITORY: 'fork/repo' }, { GITHUB_REF: 'refs/heads/branch' }, { GITHUB_SHA: 'main' }, { R35_PREPARATION_COMMIT_MESSAGE: '[stage-cabin-preparation] [stage-cabin-integration]' }, { R35_PREPARATION_COMMIT_MESSAGE: token + ' [stage-cabin-integration]' }, { R35_PREPARATION_COMMIT_MESSAGE: token + ' [stage-cabin-preparation]' }, { R35_PREPARATION_APP_ROOT: '/tmp/other' }, { R35_CAPTURE_TIMEOUT: '180000' }, { R35_MAX_BUFFER_PIXELS: '1000000' }]) assert.throws(() => resolved(change));
  for (const key of ['R35_PREPARATION_BASE_URL', 'R35_CABIN_BASE_URL', 'R35_BASE_URL', 'R35_DPR_BASE_URL', 'R35_CABIN_URL', 'R35_MODEL_URL']) for (const value of [origin, origin + '/', 'http://127.0.0.1:4178', 'https://other.test']) assert.throws(() => resolved({ [key]: value }));
  const staged = { ...env, R35_PREPARATION_MODE: undefined, R35_ALLOW_LIVE_PREPARATION: undefined, R35_PREPARATION_COMMIT_MESSAGE: '[stage-cabin-preparation] [stage-cabin-integration]' };
  assert.equal(policy.validatePreparationEnvironment({ ...staged, ...policy.resolvePreparationRequest(request, staged) }).baseUrl, 'http://127.0.0.1:4178');
  assert.throws(() => policy.resolvePreparationRequest(request, { ...staged, R35_ALLOW_LIVE_PREPARATION: '1' }));
});

test('live approval independently binds the staged source, runtime and exact raw/gzip model', async () => {
  assert.deepEqual(policy.validatePreparationReleaseMarker(marker(), request, resolved()), marker());
  for (const key of Object.keys(marker())) { const copy = marker(); delete copy[key]; assert.throws(() => policy.validatePreparationReleaseMarker(copy, request, resolved()), key); }
  for (const change of [{ allow: false }, { release: '[release-cabin-preview]' }, { stagedSource: 'b'.repeat(40) }, { sourceSha: 'current' }, { sourceTree: 'f'.repeat(64) }, { modelBytes: 19170816 }, { modelSha256: '5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326' }, { modelGzipBytes: 1 }, { modelGzipSha256: 'f'.repeat(64) }, { baseUrl: origin }]) assert.throws(() => policy.validatePreparationReleaseMarker({ ...marker(), ...change }, request, resolved()));
  assert.throws(() => policy.validatePreparationReleaseMarker(request, request, resolved()), 'The staged request itself cannot approve a public run');
  const old = { release: 'Premium transparent-window and renderer-lifecycle incremental repair · work in progress', reviewedSource: '183672cc9470600b5ab527facebb0e2d10a39015', cabinGlbSha256: '5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326', cabinGlbBytes: 19170816 };
  assert.throws(() => policy.validatePreparationReleaseMarker(old, request, resolved()), 'The historical marker must not authorize this model');
  await assert.rejects(driver.main({ ...resolved(), R35_ALLOW_LIVE_PREPARATION: undefined }));
});

const publicBodies = async () => {
  const manifest = JSON.parse(await read('modeldata/manifest.json'));
  return [gunzipSync(await read('qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz')), Buffer.concat(await Promise.all(manifest[0].chunks.map(chunk => read('modeldata/' + chunk.path)))), gunzipSync(await read('qa/cabin-preview/r35-exterior-cabin-proxy.glb.gz'))];
};
test('public preflight hashes all exact model bodies with bounded identity GETs and no redirect', async () => {
  const bodies = await publicBodies(), calls = [];
  const receipts = await driver.verifyPublicPreparationModels({ fetchImpl: async (url, options) => {
    calls.push({ url, options }); const index = policy.models.findIndex(model => origin + model.path === url); assert.ok(index >= 0);
    return new Response(bodies[index], { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bodies[index].length) } });
  } });
  assert.deepEqual(receipts, policy.models.map(model => ({ ...model, url: origin + model.path })));
  assert.equal(calls.length, 3); for (const { options } of calls) { assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.headers['Accept-Encoding'], 'identity'); assert.ok(options.signal instanceof AbortSignal); }
});
test('public model preflight fails closed on old, changed, oversized or redirected representations', async () => {
  const bytes = (await publicBodies())[0]; const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
  for (const response of [() => new Response(changed, { headers: { 'content-type': 'model/gltf-binary' } }), () => new Response(bytes, { status: 302, headers: { location: origin } }), () => new Response(bytes, { headers: { 'content-type': 'text/html' } }), () => new Response(bytes, { headers: { 'content-type': 'model/gltf-binary', 'content-encoding': 'gzip' } }), () => new Response(bytes, { headers: { 'content-type': 'model/gltf-binary', 'content-length': String(bytes.length + 1) } }), () => new Response(Buffer.alloc(bytes.length + 1), { headers: { 'content-type': 'model/gltf-binary' } })]) await assert.rejects(driver.verifyPublicPreparationModels({ fetchImpl: async () => response() }));
});

test('the same native network observer accepts only the mode-pinned target without widening staged mode', async () => {
  const cdp = new EventEmitter(), calls = [], row = { errors: [], network: [], modelBodies: [], expectedCancellations: [], expectedFailures: [] };
  cdp.send = async (...args) => { calls.push(args); };
  await assert.rejects(installCabinNetworkCapture(cdp, row, { baseUrl: origin, phase: () => 'test' })); assert.deepEqual(calls, []);
  const observer = await installCabinNetworkCapture(cdp, row, { mode: 'live', baseUrl: origin, phase: () => 'test' });
  cdp.emit('Network.requestWillBeSent', { requestId: 'bad', request: { url: origin + policy.models[0].path + '?override=1', method: 'GET' }, wallTime: 1 });
  assert.equal(row.errors.length, 1); await observer.close();
  for (const baseUrl of [origin + '/', 'http://gtr-lab-production.up.railway.app', 'https://other.test', 'http://127.0.0.1:4178']) await assert.rejects(installCabinNetworkCapture(cdp, row, { mode: 'live', baseUrl, phase: () => 'test' }));
});

test('live source closure cannot borrow staged-origin evidence or waive any transport requirement', () => {
  const url = origin + policy.models[0].path;
  const row = { name: 'direct-entry-residency', errors: [], pageErrors: [], requestFailures: [], expectedCancellations: [], expectedFailures: [], observation: { totals: { fetches: 1 } }, runtimeBodies: [], networkObserver: { buffers: { maxResourceBufferSize: 32 * 1024 * 1024, maxTotalBufferSize: 128 * 1024 * 1024 }, closed: true, fetchEnableCount: 0, fetchDisableCount: 0 },
    browserModelRequests: [{ requestId: 1, url, status: 200 }], modelBodies: [{ path: policy.models[0].path, requestId: 'native-1', source: 'CDP.Network.getResponseBody', status: 200, bytes: policy.models[0].bytes, sha256: policy.models[0].sha256 }],
    network: [{ requestId: 'native-1', sent: true, url, terminal: 'finished', wallTime: 1, status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': String(policy.cabinWire.bytes) }, encodedBodyBytes: policy.cabinWire.bytes, encodedTotalBytes: policy.cabinWire.bytes + 641, cached: false }] };
  const wire = { wireEntityBytes: policy.cabinWire.bytes, wireEntitySha256: policy.cabinWire.sha256 };
  assert.equal(policy.assertCaseSourceClosure(row, wire, 'live').verifiedDecodedBodies, 1);
  assert.throws(() => policy.assertCaseSourceClosure(row, wire));
  for (const mutate of [r => { r.network[0].url = 'http://127.0.0.1:4178' + policy.models[0].path; }, r => { r.browserModelRequests[0].url += '?x'; }, r => { r.modelBodies[0].sha256 = 'f'.repeat(64); }, r => { r.network[0].headers['Content-Length'] = '1'; }, r => { r.modelBodies[0].error = 'No resource'; }]) { const copy = structuredClone(row); mutate(copy); assert.throws(() => policy.assertCaseSourceClosure(copy, wire, 'live')); }
});

test('release workflow and driver retain strict proof, immutable release gate and staged-only server branch', async () => {
  const source = String(await read('scripts/diagnose-cabin-preparation.mjs')), workflow = String(await read('.github/workflows/cabin-preview-live.yml'));
  assert.match(source, /if \(target.mode === 'staged'\) \{\s+const \{ createAppServer \} = await import/);
  assert.ok(source.indexOf('await verifyPublicPreparationModels(') < source.indexOf('browser = await chromium.launch'));
  assert.ok(source.indexOf('await verifyReleaseAssets(') < source.indexOf('browser = await chromium.launch'));
  assert.match(source, /validatePreparationReleaseMarker\(/); assert.match(source, /git.*[\s\S]*diff-tree/);
  assert.match(workflow, /release-cabin-realism-approved-20261007-1640.approved/); assert.match(workflow, /\[release-cabin-preparation-ao-static-faces\]/);
  for (const text of ['contents: read', 'persist-credentials: false', 'ref: ${{ github.sha }}', 'viewport: [desktop, mobile]', 'lane: [feature, lifecycle]', 'quality: reduced', 'node scripts/wait-railway.mjs', 'node scripts/diagnose-cabin-preparation.mjs', 'node --test tests/cabin-preparation-contract.node.mjs tests/cabin-preparation-live.node.mjs']) assert.ok(workflow.includes(text), text);
  assert.doesNotMatch(workflow, /workflow_dispatch|continue-on-error|npm test|tests\/server|git push|railway up|R35_CABIN_BASE_URL|capture-cabin-preview/);
  assert.deepEqual(policy.budgets, { initial: 90000, functional: 20000, lifecycle: 30000, screenshot: 45000 });
  assert.equal(policy.preparationTree, 'bc1ac6ce3c3a97bf683a6b0bdc057e73f47800544e913b675db583b65f1605b5');
});
