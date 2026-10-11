/** Closed, exact-source preparation/residency acceptance. No browser or socket side effects. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const preparationContract = 'premium-unified-cabin-preparation-residency-v1';
// Exact independently reviewed runtime, including the route accessibility and transport layers.
export const preparationTree = 'f1a85dab956b213641c6d866a3393b8af3f6b908413dea1707d5d600240284cf';
export const budgets = Object.freeze({ initial: 90_000, functional: 20_000, lifecycle: 30_000, screenshot: 45_000 });
export const requiredCases = Object.freeze({ feature: Object.freeze(['direct-entry-residency']), lifecycle: Object.freeze([
  'resize-quality-during-preparation', 'trusted-route-cancels-fetch', 'trusted-model-cancels-native-decode-delivery',
  'trusted-model-cancels-gpu-queue', 'network-failure-exterior-and-retry', 'native-viewer-retry-retires-residency', 'savedata-and-nonpremium-boundaries',
]) });
export const modelRequestSequences = Object.freeze(Object.fromEntries([
  ['direct-entry-residency', [200]], ['resize-quality-during-preparation', [200]], ['trusted-route-cancels-fetch', ['aborted', 200]],
  ['trusted-model-cancels-native-decode-delivery', [200]], ['trusted-model-cancels-gpu-queue', [200]],
  ['network-failure-exterior-and-retry', [503, 200]], ['native-viewer-retry-retires-residency', [200, 200]], ['savedata-and-nonpremium-boundaries', [200]],
].map(([name, sequence]) => [name, Object.freeze(sequence)])));
export const models = Object.freeze([
  Object.freeze({ path: '/models/r35-cabin-dashboard-5c0a9dca.glb', bytes: 19_170_816, sha256: '5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326' }),
  Object.freeze({ path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' }),
  Object.freeze({ path: '/models/r35-exterior-cabin-proxy-49d7c2ab.glb', bytes: 956_368, sha256: '49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347' }),
]);
const ownKeys = (object, expected) => assert.deepEqual(Object.keys(object).sort(), [...expected].sort());
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function readinessWindow(budget, now = performance.now()) {
  assert.ok([15_000, ...Object.values(budgets)].includes(budget)); assert.ok(Number.isFinite(now));
  return Object.freeze({ startedAt: now, deadline: now + budget, budget, clock: 'node-performance' });
}
export function remainingBudget(window, now = performance.now()) {
  assert.ok(window && Number.isFinite(window.startedAt) && Number.isFinite(window.deadline) && window.deadline === window.startedAt + window.budget);
  assert.ok(Number.isFinite(now) && now >= window.startedAt && now < window.deadline, 'Original readiness deadline exceeded');
  return window.deadline - now;
}
export function validatePreparationEnvironment(env) {
  assert.match(preparationTree ?? '', /^[a-f0-9]{64}$/, 'Preparation runtime has not been frozen');
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab');
  assert.equal(env.GITHUB_REF, 'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/); assert.equal(env.R35_SOURCE_SHA, env.GITHUB_SHA);
  assert.equal(env.R35_EXPECTED_APP_TREE, preparationTree); assert.equal(env.R35_PREPARATION_CONTRACT, preparationContract);
  for (const marker of ['[stage-cabin-preparation]', '[stage-cabin-integration]']) assert.ok((env.R35_PREPARATION_COMMIT_MESSAGE ?? '').includes(marker), marker);
  for (const name of ['R35_DPR_BASE_URL', 'R35_BASE_URL', 'R35_CABIN_URL', 'R35_MODEL_URL', 'R35_CAPTURE_TIMEOUT', 'R35_MAX_BUFFER_PIXELS']) assert.equal(env[name], undefined, `Unreviewed override ${name}`);
  assert.ok(['desktop', 'mobile'].includes(env.R35_QA_VIEWPORT));
  assert.ok(['feature', 'lifecycle'].includes(env.R35_PREPARATION_LANE));
  return { name: env.R35_QA_VIEWPORT, lane: env.R35_PREPARATION_LANE, baseUrl: 'http://127.0.0.1:4178',
    ...(env.R35_QA_VIEWPORT === 'desktop' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } :
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }) };
}
export function resolvePreparationRequest(request, env) {
  ownKeys(request, ['version', 'allow', 'sourceSha', 'sourceTree', 'contract', 'modelSha256']);
  assert.equal(request.version, 1); assert.equal(request.allow, true); assert.equal(request.sourceSha, 'current');
  assert.equal(request.sourceTree, preparationTree); assert.equal(request.contract, preparationContract);
  assert.equal(request.modelSha256, models[0].sha256, 'Only the exact accepted 5c0a model is admitted');
  const values = { R35_SOURCE_SHA: env.GITHUB_SHA, R35_EXPECTED_APP_TREE: preparationTree, R35_PREPARATION_CONTRACT: preparationContract };
  validatePreparationEnvironment({ ...env, ...values }); return values;
}
/** Derive image provenance only after full accepted parent GLB verification. */
export function acceptedCabinImages(bytes) {
  assert.equal(bytes.length, models[0].bytes); assert.equal(sha256(bytes), models[0].sha256);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12); assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binaryHeader = 20 + jsonLength; assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  const binary = bytes.subarray(binaryHeader + 8, binaryHeader + 8 + bytes.readUInt32LE(binaryHeader));
  assert.ok(document.images.length > 0);
  return document.images.map((image, index) => {
    assert.equal(image.uri, undefined, 'External image URLs are forbidden');
    const view = document.bufferViews[image.bufferView]; assert.equal(view.buffer ?? 0, 0);
    const body = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength); assert.equal(body.length, view.byteLength);
    return { name: image.name ?? `embedded-image-${index}`, bytes: body.length, mimeType: image.mimeType, sha256: sha256(body) };
  });
}
export function assertResidentWorkUnchanged(before, after) {
  for (const name of ['fetches', 'gltfParses', 'bitmapRequests', 'compileShader', 'linkProgram', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D']) {
    for (const sample of [before, after]) assert.ok(Number.isSafeInteger(sample?.[name]) && sample[name] >= 0, `Missing or malformed ${name} counter`);
    assert.equal(after[name], before[name], `Resident re-entry submitted new ${name}`);
  }
}
export function assertCurrentGeometry(snapshot, quality, nativeDpr) {
  assert.ok(['standard', 'reduced'].includes(quality)); const d = snapshot.dimensions;
  for (const key of ['renderWidth', 'renderHeight', 'cssWidth', 'cssHeight']) assert.ok(Number.isFinite(d[key]) && d[key] > 0);
  const ratio = Math.min(nativeDpr, 1.5, Math.sqrt((quality === 'reduced' ? 1_000_000 : 2_000_000) / (d.renderWidth * d.renderHeight)));
  assert.equal(d.pixelRatio, ratio); assert.equal(d.width, Math.floor(d.renderWidth * ratio)); assert.equal(d.height, Math.floor(d.renderHeight * ratio));
  assert.ok(Math.abs(d.renderWidth - d.cssWidth) <= 1 && Math.abs(d.renderHeight - d.cssHeight) <= 1);
}
export function assertPreparationTimeline(observation, ready, { quality, nativeDpr, driverPose }) {
  assert.deepEqual(observation.issues, []); assert.equal(ready.reusedUnchanged, false);
  assert.ok([0x911a, 0x911c].includes(ready.nativeStatus)); assert.ok([0x911a, 0x911c].includes(ready.drainNativeStatus));
  assertCurrentGeometry(ready.snapshot, quality, nativeDpr);
  const events = observation.events.filter(e => e.owner === ready.owner);
  const replacement = events.findLast(e => e.kind === 'buffer-replaced' && e.at <= ready.readyAt);
  assert.ok(replacement, 'Actual default-buffer warmup replacement must be observed');
  const main = events.find(e => e.kind === 'main' && e.id === ready.mainDrawId);
  assert.ok(main && main.at > replacement.at && main.stable, 'Fresh actual main is required after warmup');
  assert.deepEqual(main.snapshot, ready.snapshot, 'Certificate must describe the exact completed main snapshot');
  assert.equal(main.snapshot.vehicle.full, false); assert.equal(main.snapshot.vehicle.cabinSeat, null);
  const mainFence = events.find(e => e.kind === 'fence' && e.id === ready.fenceId && e.draws.includes(ready.mainDrawId) && e.at >= main.at);
  assert.ok(mainFence, 'Certificate fence must actually include the certified main draw');
  const wait = events.find(e => e.kind === 'wait' && e.id === ready.fenceId && e.status === ready.nativeStatus && e.at >= mainFence.at);
  assert.ok(wait && wait.at >= main.at && wait.at <= ready.readyAt, 'Actual native-positive main completion is required');
  const drainFence = events.find(e => e.kind === 'fence' && e.id === ready.drainFenceId);
  assert.ok(drainFence && events.some(e => e.kind === 'wait' && e.id === drainFence.id && e.status === ready.drainNativeStatus && e.at >= wait.at && e.at <= ready.readyAt), 'Native drain certificate must name an actual completed fence');
  assert.equal(events.some(e => ['invalid', 'stop'].includes(e.kind) && e.at >= replacement.at && e.at <= ready.readyAt), false);
  for (const e of events.filter(e => e.kind === 'buffer-replaced' || (e.kind === 'main' && e.snapshot?.vehicle.full && e.at < ready.readyAt))) {
    assert.equal(e.ui.maskCount, 1, 'Warmup must remain behind the one opaque stage mask');
    assert.equal(e.ui.maskOpaque, true, 'Warmup mask must cover the actual stage at full opacity');
    assert.equal(e.ui.legacyLoading, false, 'No separate cabin-loading strip');
  }
  const transition = observation.dom.find(e => e.ready);
  assert.ok(transition, 'Ready transition must be observed');
  const completion = draw => events.filter(fence => fence.kind === 'fence' && fence.draws.includes(draw.id) && fence.at >= draw.at).flatMap(fence => events.filter(signal => signal.kind === 'wait' && signal.id === fence.id && [0x911a, 0x911c].includes(signal.status) && signal.at >= fence.at && signal.at <= transition.at));
  const near = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) <= 1e-8);
  const driver = events.find(e => e.kind === 'main' && e.stable && e.at > replacement.at && e.at < transition.at && e.snapshot?.vehicle?.exterior && e.snapshot.vehicle.full && !e.snapshot.vehicle.proxy && e.snapshot.camera?.preset === 'interior' && near(e.snapshot.pose?.position, driverPose?.position) && near(e.snapshot.pose?.projection, driverPose?.projection) && (near(e.snapshot.pose?.quaternion, driverPose?.quaternion) || near(e.snapshot.pose?.quaternion, driverPose?.quaternion?.map(v => -v))));
  assert.ok(driver, 'An actual stable driver-view main with the independent exact pose is required');
  assertCurrentGeometry(driver.snapshot, quality, nativeDpr); assert.deepEqual(driver.snapshot.dimensions, ready.snapshot.dimensions, 'Driver preparation must certify current geometry');
  const driverCompleted = completion(driver); assert.ok(driverCompleted.length > 0, 'Driver-view main must complete natively');
  const restored = events.filter(e => e.kind === 'main' && e.stable && e.at > replacement.at && e.at <= transition.at && e.snapshot?.vehicle.exterior && !e.snapshot.vehicle.full && e.snapshot.vehicle.cabinSeat === null);
  assert.ok(restored.some(draw => driverCompleted.some(done => done.at <= draw.at) && completion(draw).length > 0), 'Ready UI must follow driver completion then restored exterior native completion');
  for (const e of observation.dom.filter(e => e.ready && e.at <= ready.readyAt)) {
    assert.equal(e.maskCount, 0); assert.equal(e.legacyLoading, false);
  }
}
export function assertReadableControls(layout) {
  assert.equal(layout.overflow, false); assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height) && layout.width > 0 && layout.height > 0);
  assert.deepEqual(layout.items.map(item => item.text).sort(), ['Driver', 'Passenger', 'Rear seat', 'Back to exterior'].sort());
  for (const item of layout.items) {
    for (const key of ['x', 'y', 'right', 'bottom', 'width', 'height', 'fontSize', 'scrollWidth', 'clientWidth']) assert.ok(Number.isFinite(item[key]), `Missing control rectangle ${key}`);
    assert.equal(item.visible, true, `Hidden control ${item.text}`);
    assert.ok(item.x >= 0 && item.y >= 0 && item.right <= layout.width + .5 && item.bottom <= layout.height + .5 && item.width > 0 && item.height >= 36, item.text);
    assert.ok(Math.abs(item.right - item.x - item.width) < 1 && Math.abs(item.bottom - item.y - item.height) < 1, `Inconsistent control rectangle ${item.text}`);
    assert.ok(item.fontSize >= 12 && item.scrollWidth <= item.clientWidth + 1, `Readable control ${item.text}`);
  }
  for (let i = 0; i < layout.items.length; i++) for (let j = i + 1; j < layout.items.length; j++) {
    const a = layout.items[i], b = layout.items[j];
    assert.ok(a.right <= b.x + .5 || b.right <= a.x + .5 || a.bottom <= b.y + .5 || b.bottom <= a.y + .5, 'Seat and Back controls overlap');
  }
}

/** Fail closed on all origin/body errors and reconcile successful browser model loads. */
export function assertCaseSourceClosure(row, wire) {
  assert.deepEqual(row.errors, [], 'Any source/observation error invalidates the case');
  assert.deepEqual(row.pageErrors, []);
  const cancellations = row.expectedCancellations ?? [], failures = row.expectedFailures ?? [];
  assert.ok(Object.hasOwn(modelRequestSequences, row.name), 'Unknown browser case');
  assert.deepEqual(row.network.map(n => n.failed ? 'aborted' : n.status), modelRequestSequences[row.name], 'Exact model request sequence required');
  assert.equal(row.observation.totals.fetches, modelRequestSequences[row.name].length, 'Model fetch count cannot adopt duplicate loads as baseline');
  assert.ok(Number.isSafeInteger(wire.wireEntityBytes) && wire.wireEntityBytes > 0 && wire.wireEntityBytes < models[0].bytes);
  const aborted = id => cancellations.some(c => c.requestId === id) && row.requestFailures.some(f => f.requestId === id && /net::ERR_ABORTED/.test(f.error));
  for (const failure of row.requestFailures) assert.ok(aborted(failure.requestId), 'Unrequested or unproven request failure');
  for (const cancellation of cancellations) assert.ok(aborted(cancellation.requestId), 'The exact intended request was not actually cancelled');
  for (const receipt of row.runtimeBodies) {
    assert.ok(Number.isSafeInteger(receipt.requestId) && receipt.requestId > 0);
    if (receipt.fixture) {
      assert.ok(failures.some(f => f.requestId === receipt.requestId && f.status === receipt.status && f.reason === receipt.fixture));
      assert.equal(receipt.path, models[0].path); continue;
    }
    if (receipt.error) { assert.ok(aborted(receipt.requestId), 'A response-body error requires the exact proven cancelled request'); continue; }
    assert.equal(receipt.status, 200); assert.match(receipt.sha256 ?? '', /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0);
  }
  for (const failure of failures) assert.equal(row.runtimeBodies.filter(r => r.requestId === failure.requestId && r.fixture === failure.reason && r.status === failure.status).length, 1);
  const decoded = row.runtimeBodies.filter(r => r.path === models[0].path && r.status === 200 && !r.error && !r.fixture);
  assert.ok(decoded.length > 0, 'Every case must complete at least one exact real browser model load');
  const used = new Set();
  for (const body of decoded) {
    assert.equal(body.sha256, models[0].sha256); assert.equal(body.bytes, models[0].bytes); assert.ok(Number.isFinite(body.startedAt));
    const matches = row.network.filter(n => Number.isFinite(n.wallTime) && Math.abs(n.wallTime * 1000 - body.startedAt) < 1);
    assert.equal(matches.length, 1, 'Unique actual CDP request by native request start time required');
    const network = matches[0]; assert.ok(!used.has(network.requestId)); used.add(network.requestId);
    assert.equal(network.status, 200); assert.equal(network.failed, undefined); assert.equal(network.cached, false);
    assert.ok(Number.isSafeInteger(network.encodedTotalBytes) && network.encodedTotalBytes >= wire.wireEntityBytes, 'Completed network transport receipt is mandatory');
    assert.ok(Number.isSafeInteger(network.encodedBodyBytes) && network.encodedBodyBytes >= 0);
    const headers = Object.fromEntries(Object.entries(network.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    assert.equal(headers['content-encoding'], 'gzip'); assert.equal(Number(headers['content-length']), wire.wireEntityBytes);
  }
  const successfulNetwork = row.network.filter(n => n.status === 200 && !n.failed);
  assert.equal(successfulNetwork.length, used.size, 'No successful model transport may lack a verified decoded body');
  return { verifiedDecodedBodies: decoded.length, correlatedNativeRequestIds: [...used] };
}
