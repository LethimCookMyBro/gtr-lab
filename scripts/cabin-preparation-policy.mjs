/** Closed, exact-source preparation/residency acceptance. No browser or socket side effects. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const preparationContract = 'premium-unified-cabin-preparation-ao-static-faces-v1';
// Exact independently reviewed runtime, including the route accessibility and transport layers.
export const preparationTree = 'bc1ac6ce3c3a97bf683a6b0bdc057e73f47800544e913b675db583b65f1605b5';
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
  Object.freeze({ path: '/models/r35-cabin-contact-ao-static-faces-8645956f.glb', bytes: 20_195_752, sha256: '8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452' }),
  Object.freeze({ path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' }),
  Object.freeze({ path: '/models/r35-exterior-cabin-proxy-49d7c2ab.glb', bytes: 956_368, sha256: '49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347' }),
]);
export const cabinWire = Object.freeze({ bytes: 10_194_084, sha256: 'efe0ace781740e4b1cec685f02bf6b94eb6654447cccb96cc79769bfd01eee16' });
export const cabinResourcePlan = Object.freeze({ imageCount: 11, textureObjects: 62, compileJobs: 78, textureJobs: 62, geometryJobs: 78, totalJobs: 218,
  scope: 'Exact CPU GLTFLoader/job-construction expectations; Texture objects are not native GPU allocation counts.' });
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
  const quality = env.R35_PREPARATION_QUALITY ?? 'standard'; assert.ok(['standard', 'reduced'].includes(quality));
  assert.ok(quality === 'standard' || (env.R35_QA_VIEWPORT === 'desktop' && env.R35_PREPARATION_LANE === 'feature'), 'Reduced comparison is one independent desktop feature cell');
  return { name: env.R35_QA_VIEWPORT, lane: env.R35_PREPARATION_LANE, quality, baseUrl: 'http://127.0.0.1:4178',
    ...(env.R35_QA_VIEWPORT === 'desktop' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } :
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }) };
}
export function resolvePreparationRequest(request, env) {
  ownKeys(request, ['version', 'allow', 'sourceSha', 'sourceTree', 'contract', 'modelSha256']);
  assert.equal(request.version, 1); assert.equal(request.allow, true); assert.equal(request.sourceSha, 'current');
  assert.equal(request.sourceTree, preparationTree); assert.equal(request.contract, preparationContract);
  assert.equal(request.modelSha256, models[0].sha256, 'Only the exact accepted 8645956f AO/static-face model is admitted');
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
  assert.equal(document.images.length, cabinResourcePlan.imageCount);
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
/** Fixed same-size desktop comparison; an accidental smaller CSS canvas cannot pass. */
export function assertDesktopFeatureGeometry(snapshot, quality) {
  assertCurrentGeometry(snapshot, quality, 2);
  for (const key of ['cssWidth', 'renderWidth']) assert.equal(snapshot.dimensions[key], 1440);
  for (const key of ['cssHeight', 'renderHeight']) assert.equal(snapshot.dimensions[key], 744);
  const backing = quality === 'standard' ? [1967, 1016] : [1391, 718];
  assert.equal(snapshot.dimensions.width, backing[0]); assert.equal(snapshot.dimensions.height, backing[1]);
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
/** Same strict physical tolerance as the pinned cabin oracle; pixels remain exact separately. */
export function assertRestoredExteriorPose(actual, expected) {
  const tuple = (value, size) => Array.isArray(value) && value.length === size && Array.from({ length: size }, (_, index) => Object.hasOwn(value, index) && Number.isFinite(value[index])).every(Boolean);
  const near = (a, b, size) => tuple(a, size) && tuple(b, size) && a.every((value, index) => Math.abs(value - b[index]) <= 1e-8);
  assert.ok(near(actual?.position, expected?.position, 3), 'Restored exterior position differs');
  assert.ok(near(actual?.projection, expected?.projection, 16), 'Restored exterior projection differs');
  assert.ok(near(actual?.quaternion, expected?.quaternion, 4) || (tuple(expected?.quaternion, 4) && near(actual?.quaternion, expected.quaternion.map(value => -value), 4)), 'Restored exterior orientation differs');
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


/** Same completed frame, exact mobile track width, and visible controls at both widths. */
export function assertMobileContainment(layout, certificate, viewport) {
  assert.ok([320, 390].includes(viewport.width)); assert.equal(viewport.height, 844);
  assert.equal(layout.width, viewport.width); assert.equal(layout.height, viewport.height); assert.equal(layout.overflow, false);
  assert.ok(Number.isSafeInteger(certificate.owner) && certificate.owner > 0);
  assert.ok([0x911a, 0x911c].includes(certificate.nativeStatus)); assert.equal(certificate.reusedUnchanged, false);
  const rect = (value, name) => {
    for (const key of ['x', 'y', 'right', 'bottom', 'width', 'height']) assert.ok(Number.isFinite(value?.[key]), `Missing ${name} rectangle ${key}`);
    assert.equal(value.visible, true, `Hidden ${name}`);
    assert.ok(value.width > 0 && value.height > 0 && value.x >= 0 && value.y >= 0 && value.right <= layout.width && value.bottom <= layout.height, `${name} exceeds viewport`);
    assert.ok(Math.abs(value.x + value.width - value.right) < 1e-8 && Math.abs(value.y + value.height - value.bottom) < 1e-8, `Inconsistent ${name} rectangle`);
  };
  for (const name of ['header', 'headerRow', 'stage', 'canvas']) { rect(layout[name], name); assert.equal(layout[name].x, 0); assert.equal(layout[name].width, layout.width); }
  assert.ok(layout.headerRow.y >= layout.header.y && layout.headerRow.bottom <= layout.header.bottom);
  assert.ok(layout.header.bottom <= layout.stage.y, 'Header overlaps the stage');
  for (const key of ['x', 'y', 'right', 'bottom', 'width', 'height']) assert.equal(layout.canvas[key], layout.stage[key], `Canvas differs from stage ${key}`);
  const d = certificate.snapshot.dimensions;
  assert.equal(d.cssWidth, layout.canvas.width); assert.equal(d.cssHeight, layout.canvas.height);
  assert.equal(d.renderWidth, layout.canvas.width); assert.equal(d.renderHeight, layout.canvas.height);
  assert.equal(layout.backingWidth, d.width); assert.equal(layout.backingHeight, d.height);
  assert.ok(Number.isSafeInteger(d.width) && d.width > 0 && Number.isSafeInteger(d.height) && d.height > 0);
  assertReadableControls(layout);
  assert.deepEqual(layout.headerControls.map(item => item.text).sort(), ['Back to models', 'GT-R LAB home', 'Model detail'].sort());
  for (const item of layout.headerControls) {
    rect(item, item.text); assert.ok(item.y >= layout.headerRow.y && item.bottom <= layout.headerRow.bottom, 'Header control outside its row');
    for (const key of ['fontSize', 'scrollWidth', 'clientWidth']) assert.ok(Number.isFinite(item[key]) && item[key] > 0, `Missing header typography ${key}`);
    assert.ok(item.scrollWidth <= item.clientWidth + 1, `Clipped header control ${item.text}`);
  }
  const all = [...layout.items, ...layout.headerControls];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j]; assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, 'Mobile controls overlap');
  }
}


/** Actual error message and Retry must remain visible without covering scene controls. */
export function assertPreparationErrorLayout(layout, certificate, viewport) {
  assert.equal(layout.width, viewport.width); assert.equal(layout.height, viewport.height); assert.equal(layout.overflow, false);
  assert.ok(Number.isFinite(layout.width) && layout.width > 0 && Number.isFinite(layout.height) && layout.height > 0);
  assert.equal(layout.count, 1); assert.equal(layout.phase, 'error'); assert.equal(layout.role, 'alert');
  assert.ok(Number.isFinite(layout.documentHeight) && layout.documentHeight >= layout.height); assert.equal(layout.scrollY, 0);
  for (const overflow of [layout.documentOverflowY, layout.bodyOverflowY]) assert.ok(['visible', 'auto', 'scroll'].includes(overflow), 'Error rows must remain scroll reachable');
  const rect = (value, name, limit = layout.height) => {
    for (const key of ['x', 'y', 'right', 'bottom', 'width', 'height']) assert.ok(Number.isFinite(value?.[key]), `Missing ${name} rectangle ${key}`);
    assert.ok(value.width > 0 && value.height > 0 && value.x >= 0 && value.y >= 0 && value.right <= layout.width && value.bottom <= limit, `${name} exceeds viewport`);
    assert.ok(Math.abs(value.x + value.width - value.right) < 1e-8 && Math.abs(value.y + value.height - value.bottom) < 1e-8, `Inconsistent ${name} rectangle`);
  };
  const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.right <= b.right && a.bottom <= b.bottom;
  const apart = (a, b) => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
  for (const name of ['card', 'message', 'retry', 'stage', 'canvas']) { rect(layout[name], name); assert.equal(layout[name].visible, true, `Hidden ${name}`); }
  for (const name of ['card', 'message', 'retry']) {
    for (const key of ['scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight', 'fontSize']) assert.ok(Number.isFinite(layout[name][key]) && layout[name][key] > 0, `Missing ${name} typography ${key}`);
    assert.ok(layout[name].scrollWidth <= layout[name].clientWidth + 1 && layout[name].scrollHeight <= layout[name].clientHeight + 1, `Clipped ${name}`);
  }
  assert.ok(inside(layout.message, layout.card) && inside(layout.retry, layout.card)); assert.ok(apart(layout.message, layout.retry), 'Message and Retry overlap');
  assert.equal(layout.message.text, 'Interior preparation couldn’t finish. The model could not be loaded (HTTP 503).');
  assert.equal(layout.retry.text, 'Retry interior preparation'); assert.equal(layout.retry.enabled, true); assert.ok(layout.retry.height >= 44);
  assert.ok(Array.isArray(layout.message.lines) && layout.message.lines.length > 0 && layout.message.lines.length <= 20);
  for (const line of layout.message.lines) { rect(line, 'Message line'); assert.ok(inside(line, layout.message) && inside(line, layout.card)); assert.equal(line.hit, true, 'Message is obscured'); }
  assert.ok(Array.isArray(layout.retry.hits)); assert.equal(layout.retry.hits.length, 5);
  for (const index of [0, 1, 2, 3, 4]) assert.equal(layout.retry.hits[index], true, 'Retry hit target is obscured');
  assert.deepEqual(layout.blockers.map(b => b.name).sort(), ['Switch model', 'Interaction hint', 'Scene tools'].sort());
  for (const blocker of layout.blockers) { rect(blocker, blocker.name, layout.documentHeight); assert.equal(blocker.visible, true); assert.ok(apart(layout.card, blocker), `Error card overlaps ${blocker.name}`); }
  assert.deepEqual(layout.headerControls.map(control => control.name).sort(), ['Back to models', 'GT-R LAB home', 'Model detail'].sort());
  for (const control of layout.headerControls) { rect(control, control.name); assert.equal(control.visible, true); assert.equal(control.hit, true); assert.ok(apart(layout.card, control), 'Error card obscures navigation'); }
  rect(layout.main, 'Main container', layout.documentHeight); assert.equal(layout.main.visible, true);
  for (const value of [layout.card, layout.stage, ...layout.blockers, ...layout.headerControls]) assert.ok(inside(value, layout.main), 'Error row clips outside main');
  const paint = layout.paint;
  for (const name of ['rail', 'group']) { rect(paint?.[name], 'Paint ' + name, layout.documentHeight); assert.equal(paint[name].visible, true); assert.ok(apart(layout.card, paint[name])); }
  assert.ok(inside(paint.rail, layout.main), 'Paint rail clips outside main'); assert.ok(inside(paint.group, paint.rail)); assert.ok(['auto', 'scroll'].includes(paint.overflowX));
  assert.ok(Number.isFinite(paint.group.scrollWidth) && Number.isFinite(paint.group.clientWidth) && paint.group.clientWidth > 0 && paint.group.scrollWidth >= paint.group.clientWidth); assert.equal(paint.group.scrollLeft, 0);
  assert.deepEqual(paint.labels.map(label => label.text), ['Exterior / Concept palette', 'Ultimate Silver', 'Illustrative finish, not an official paint catalog']);
  for (const label of paint.labels) {
    rect(label, 'Paint label', layout.documentHeight); assert.ok(inside(label, paint.rail)); assert.ok(apart(label, paint.group), 'Paint label overlaps swatches'); assert.equal(label.visible, true);
    for (const key of ['fontSize', 'scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight']) assert.ok(Number.isFinite(label[key]) && label[key] > 0);
    assert.ok(label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1, 'Clipped paint label');
    assert.ok(Array.isArray(label.lines) && label.lines.length > 0 && label.lines.length <= 10);
    for (const line of label.lines) { rect(line, 'Paint label line', layout.documentHeight); assert.ok(inside(line, label)); }
  }
  for (let i = 0; i < paint.labels.length; i++) for (let j = i + 1; j < paint.labels.length; j++) assert.ok(apart(paint.labels[i], paint.labels[j]), 'Paint labels overlap');
  assert.deepEqual(paint.controls.map(control => control.name), ['Ultimate Silver', 'Gun Metallic', 'Pearl White', 'Jet Black', 'Vibrant Red', 'Deep Blue', 'Stealth Gray', 'Midnight Violet', 'Dark Metal Gray']);
  let complete = 0;
  for (const control of paint.controls) {
    for (const key of ['x', 'y', 'right', 'bottom', 'width', 'height']) assert.ok(Number.isFinite(control[key]));
    assert.ok(control.width >= 44 && control.height >= 44 && Math.abs(control.x + control.width - control.right) < 1e-8 && Math.abs(control.y + control.height - control.bottom) < 1e-8);
    assert.ok(control.y >= paint.group.y && control.bottom <= paint.group.bottom); assert.ok(control.x >= paint.group.x && control.right <= paint.group.x + paint.group.scrollWidth, 'Paint control is not scroll reachable'); assert.equal(control.visible, true); assert.equal(control.enabled, true);
    const full = control.x >= paint.group.x && control.right <= paint.group.right; assert.equal(control.complete, full);
    assert.equal(control.hit, full && control.bottom <= layout.height ? true : null);
    if (full) { complete++; rect(control, 'Visible paint control', layout.documentHeight); }
  }
  assert.ok(complete > 0, 'No complete paint control is reachable');
  const regions = [layout.card, ...layout.blockers, paint.rail];
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) assert.ok(apart(regions[i], regions[j]), 'Error rows overlap');
  for (let i = 0; i < paint.controls.length; i++) for (let j = i + 1; j < paint.controls.length; j++) assert.ok(apart(paint.controls[i], paint.controls[j]), 'Paint controls overlap');
  const d = certificate.snapshot.dimensions;
  for (const key of ['x', 'y', 'right', 'bottom', 'width', 'height']) assert.equal(layout.canvas[key], layout.stage[key]);
  assert.equal(d.cssWidth, layout.canvas.width); assert.equal(d.cssHeight, layout.canvas.height); assert.equal(d.renderWidth, layout.canvas.width); assert.equal(d.renderHeight, layout.canvas.height);
  assert.equal(layout.backingWidth, d.width); assert.equal(layout.backingHeight, d.height);
  assert.ok([0x911a, 0x911c].includes(certificate.nativeStatus)); assert.equal(certificate.reusedUnchanged, false);
}

/** Fail closed. Cabin bodies and fixtures share the browser's native CDP request ID. */
export function assertCaseSourceClosure(row, wire) {
  assert.deepEqual(row.errors, [], 'Any source/observation error invalidates the case');
  assert.deepEqual(row.pageErrors, []); assert.deepEqual(row.requestFailures, [], 'Non-model request failures are never deliberate fixtures');
  const cancellations = row.expectedCancellations, failures = row.expectedFailures;
  assert.equal(row.networkObserver?.closed, true); assert.ok([0, 1].includes(row.networkObserver.fetchEnableCount)); assert.equal(row.networkObserver.fetchDisableCount, row.networkObserver.fetchEnableCount);
  assert.deepEqual(row.networkObserver.buffers, { maxResourceBufferSize: 32 * 1024 * 1024, maxTotalBufferSize: 128 * 1024 * 1024 });
  for (const value of [cancellations, failures, row.network, row.modelBodies, row.browserModelRequests]) assert.ok(Array.isArray(value));
  assert.ok(Object.hasOwn(modelRequestSequences, row.name), 'Unknown browser case');
  const sequence = modelRequestSequences[row.name];
  assert.deepEqual(row.network.map(n => n.failed ? 'aborted' : n.status), sequence, 'Exact model request sequence required');
  assert.equal(row.observation.totals.fetches, sequence.length, 'Model fetch count cannot adopt duplicate loads as baseline');
  assert.equal(row.browserModelRequests.length, sequence.length, 'Playwright must observe the same model fetch count');
  assert.deepEqual(row.browserModelRequests.map(r => r.failed ? 'aborted' : r.status), sequence);
  assert.equal(new Set(row.browserModelRequests.map(r => r.requestId)).size, sequence.length);
  for (const r of row.browserModelRequests) { assert.equal(r.url, 'http://127.0.0.1:4178' + models[0].path); if (r.failed) assert.equal(r.failed, 'net::ERR_ABORTED'); }
  assert.equal(cancellations.length, sequence.filter(v => v === 'aborted').length);
  assert.equal(failures.length, sequence.filter(v => v === 503).length);
  assert.equal(wire.wireEntityBytes, cabinWire.bytes); assert.equal(wire.wireEntitySha256, cabinWire.sha256);
  assert.ok(Number.isSafeInteger(wire.wireEntityBytes) && wire.wireEntityBytes > 0 && wire.wireEntityBytes < models[0].bytes);
  // All other actual served JS/CSS/assets still require their unchanged Playwright body hashes.
  for (const receipt of row.runtimeBodies) {
    assert.ok(Number.isSafeInteger(receipt.requestId) && receipt.requestId > 0);
    assert.notEqual(receipt.path, models[0].path); assert.equal(receipt.fixture, undefined); assert.equal(receipt.error, undefined);
    assert.equal(receipt.status, 200); assert.match(receipt.sha256 ?? '', /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0);
  }
  assert.equal(new Set(row.network.map(n => n.requestId)).size, row.network.length, 'Native request IDs must be unique');
  assert.equal(new Set(row.modelBodies.map(b => b.requestId)).size, row.modelBodies.length, 'Native body IDs must be unique');
  const used = new Set();
  for (const network of row.network) {
    assert.ok(typeof network.requestId === 'string' && network.requestId.length > 0); assert.equal(network.sent, true); assert.ok(Number.isFinite(network.wallTime));
    assert.equal(network.url, 'http://127.0.0.1:4178' + models[0].path);
    const bodies = row.modelBodies.filter(b => b.requestId === network.requestId);
    const cancellation = cancellations.find(c => c.requestId === network.requestId), failure = failures.find(f => f.requestId === network.requestId);
    if (cancellation || failure) {
      const declaration = cancellation ?? failure;
      assert.ok(Number.isSafeInteger(declaration.declaredSequence) && declaration.declaredSequence > network.interception?.pausedSequence && declaration.declaredSequence < network.terminalSequence, 'Fault declaration must precede its native terminal event');
      assert.equal(network.interception?.requestId, network.requestId); assert.equal(network.interception?.fetchId, declaration.fetchId);
      assert.equal(network.interception?.url, network.url); assert.ok(typeof declaration.fetchId === 'string' && declaration.fetchId.length > 0);
    }
    if (network.interception?.command) {
      assert.equal(network.interception.command.fetchId, network.interception.fetchId);
      assert.equal(network.interception.command.method, failure ? 'Fetch.fulfillRequest' : 'Fetch.continueRequest');
      if (!cancellation) { assert.equal(network.interception.command.completed, true); assert.equal(network.interception.command.error, undefined); }
    }
    if (network.interception && !cancellation) assert.ok(network.interception.command, 'Paused real/fault request must be explicitly released');
    if (network.failed) {
      assert.ok(cancellation && !failure, 'Only the exact predeclared native request may abort'); assert.equal(network.interception.kind, 'hold');
      assert.equal(network.interception.abortObserved, true); assert.equal(network.terminal, 'failed'); assert.deepEqual(network.failed, { error: 'net::ERR_ABORTED', cancelled: true });
      assert.equal(network.encodedTotalBytes, undefined); assert.equal(bodies.length, 0); continue;
    }
    assert.equal(cancellation, undefined, 'Expected cancellation must actually abort'); assert.equal(network.terminal, 'finished');
    assert.equal(bodies.length, 1, 'Every completed native request requires exactly one body');
    const body = bodies[0]; used.add(network.requestId);
    assert.equal(body.source, 'CDP.Network.getResponseBody'); assert.equal(body.path, models[0].path); assert.equal(body.status, network.status); assert.equal(body.error, undefined);
    assert.ok(Number.isSafeInteger(network.encodedTotalBytes) && network.encodedTotalBytes >= 0);
    assert.ok(Number.isSafeInteger(network.encodedBodyBytes) && network.encodedBodyBytes >= 0); assert.equal(network.cached, false);
    if (failure) {
      assert.equal(network.interception.kind, 'failure'); assert.equal(failure.reason, 'explicit-one-shot-503'); assert.equal(failure.status, 503); assert.equal(network.status, 503);
      const expected = Buffer.from('Explicit CI one-shot preparation transport failure'); assert.equal(body.bytes, expected.length); assert.equal(body.sha256, sha256(expected)); continue;
    }
    assert.equal(network.status, 200); assert.equal(body.sha256, models[0].sha256); assert.equal(body.bytes, models[0].bytes);
    assert.ok(network.encodedTotalBytes >= wire.wireEntityBytes, 'Completed network transport receipt is mandatory');
    const headers = Object.fromEntries(Object.entries(network.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    assert.equal(headers['content-encoding'], 'gzip'); assert.equal(Number(headers['content-length']), wire.wireEntityBytes);
  }
  assert.equal(used.size, row.modelBodies.length, 'Orphan native bodies cannot qualify');
  for (const declaration of [...cancellations, ...failures]) assert.equal(row.network.filter(n => n.requestId === declaration.requestId).length, 1);
  const decoded = row.modelBodies.filter(b => b.status === 200); assert.ok(decoded.length > 0, 'Every case must complete an exact real browser model load');
  return { verifiedDecodedBodies: decoded.length, correlatedNativeRequestIds: decoded.map(b => b.requestId) };
}
