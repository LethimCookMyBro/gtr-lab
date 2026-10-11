import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../scripts/capture-path-policy.mjs';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40), R35_CAPTURE_COMMIT_MESSAGE: 'Reviewed [stage-capture-path]', R35_CAPTURE_VIEWPORT: 'desktop', R35_CAPTURE_SCALE: 'css', R35_ALLOW_CAPTURE_PATH: '1', R35_CAPTURE_PROTOCOL: '0', R35_CAPTURE_SOURCE_SHA: '70b7644944f908a0dfad8999b0a44a61d84d5d4d', R35_CAPTURE_SOURCE_TREE: 'cd008a4eb221e3323b988a9119e4f7f5109ad90dbf122b08b32127dfea4232a2' };
const request = { version: 1, allow: true, protocolAttribution: false, sourceSha: env.R35_CAPTURE_SOURCE_SHA, sourceTree: env.R35_CAPTURE_SOURCE_TREE };
test('capture-path guard pins reviewed source and rejects local, unmarked, arbitrary-target and wildcard runs', () => {
  assert.equal(policy.validateCaptureEnvironment(env).scale, 'css');
  for (const patch of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'fork/repo' }, { GITHUB_REF: 'refs/heads/pr' }, { GITHUB_SHA: 'main' }, { GITHUB_EVENT_NAME: 'pull_request' }, { R35_CAPTURE_COMMIT_MESSAGE: 'ordinary push' }, { R35_ALLOW_CAPTURE_PATH: '0' }, { R35_CAPTURE_SOURCE_SHA: 'current' }, { R35_CAPTURE_SOURCE_TREE: 'b'.repeat(64) }, { R35_CAPTURE_BASE_URL: 'https://example.com' }, { R35_CAPTURE_SCALE: 'low' }, { R35_CAPTURE_VIEWPORT: 'tablet' }]) assert.throws(() => policy.validateCaptureEnvironment({ ...env, ...patch }));
});
test('reviewed request requires exact fields and explicit boolean allow before export', () => {
  assert.equal(policy.resolveCaptureRequest(request, env).R35_CAPTURE_SOURCE_SHA, request.sourceSha);
  for (const patch of [{ allow: false }, { allow: 'true' }, { sourceSha: 'current' }, { version: 2 }, { sourceTree: 'HEAD' }, { skipBlanks: true }]) assert.throws(() => policy.resolveCaptureRequest({ ...request, ...patch }, env));
});
test('PNG density changes map every measured CSS rectangle without changing app viewport or DPR', () => {
  const bounds = { x: 0, y: 210, width: 390, height: 392 }, overlays = [{ name: 'hint', x: 20, y: 570, width: 100, height: 32 }];
  const native = policy.mapCaptureGeometry({ png: { width: 1170, height: 2532 }, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, scale: 'device', bounds, overlays });
  assert.deepEqual(native.bounds, { x: 0, y: 630, width: 1170, height: 1176 }); assert.deepEqual(native.overlays[0], { name: 'hint', x: 60, y: 1710, width: 300, height: 96 });
  assert.equal(bounds.y, 210); assert.equal(native.factor, 3);
  assert.throws(() => policy.mapCaptureGeometry({ png: { width: 390, height: 844 }, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, scale: 'device', bounds, overlays }), /PNG/);
});
test('metadata-only CDP lifecycle distinguishes layout wait from screenshot wait and retains no payload', () => {
  let now = 0; const probe = policy.createCaptureProtocolObserver({ now: () => ++now, phase: () => 'initial-attempt-1' });
  probe.consume('pw:protocol SEND ► {"id":12,"method":"Page.getLayoutMetrics","params":{},"sessionId":"one"}');
  probe.consume('pw:protocol ◀ RECV {"id":12,"result":{"data":"sensitive-payload"},"sessionId":"one"}');
  probe.consume('pw:protocol SEND ► {"id":13,"method":"Page.captureScreenshot","params":{"clip":{"scale":0.5}},"sessionId":"one"}');
  probe.consume('pw:protocol ◀ RECV {"id":13,"result":{"data":"ignored"},"sessionId":"other"}');
  const s = probe.snapshot(); assert.equal(s.commands.length, 2); assert.equal(s.commands[0].status, 'replied'); assert.equal(s.commands[1].status, 'pending'); assert.equal(s.commands[0].durationMs, 1); assert.doesNotMatch(JSON.stringify(s), /sensitive-payload|ignored|clip/);
  probe.consume('pw:protocol ◀ RECV {"id":13,"error":{"code":-1,"message":"failure"},"sessionId":"one"}'); assert.equal(probe.snapshot().commands[1].status, 'protocol-error');
});
test('truncated screenshot response is paired by id/session without parsing or retaining image content', () => {
  const probe = policy.createCaptureProtocolObserver(); probe.consume('SEND ► {"id":9,"method":"Page.captureScreenshot","params":{},"sessionId":"one"}');
  probe.consume('◀ RECV {"id":9,"result":{"data":"abc <<<<<( LOG TRUNCATED )>>>>> xyz"},"sessionId":"one"}');
  assert.equal(probe.snapshot().commands[0].status, 'replied'); assert.doesNotMatch(JSON.stringify(probe.snapshot()), /abc|xyz/);
});
test('protocol evidence caps fail visibly instead of silently losing observations', () => {
  const probe = policy.createCaptureProtocolObserver({ maxCommands: 1 });
  for (const id of [1, 2]) probe.consume(`SEND ► {"id":${id},"method":"Page.getLayoutMetrics","sessionId":"one"}`);
  assert.equal(probe.snapshot().commands.length, 1); assert(probe.snapshot().issues.some(x => /capacity/.test(x)));
});
test('cross-lane equality requires native buffers, source and app geometry to match; capture failures remain failures', () => {
  const snapshot = { nativeDpr: 2, viewport: { width: 1440, height: 900 }, canvas: { x: 0, y: 0, width: 1440, height: 744 }, buffer: { width: 1967, height: 1016 } };
  const reports = ['css', 'device'].map(scale => ({ viewport: 'desktop', scale, sourceCommit: env.R35_CAPTURE_SOURCE_SHA, sourceTree: env.R35_CAPTURE_SOURCE_TREE, initialGeometry: snapshot, attempts: ['01-initial', '02-orbit'].map(label => ({ label, before: snapshot, after: snapshot })), result: scale === 'css' ? 'failed' : 'observed' }));
  assert.equal(policy.compareCaptureLanes(reports).pairs[0].nativeGeometryMatches, true); assert.equal(policy.compareCaptureLanes(reports).pairs[0].originalAcceptanceChanged, false); assert.equal(policy.compareCaptureLanes(reports).pairs[0].outcomes.css, 'failed');
  reports[1] = { ...reports[1], initialGeometry: { ...snapshot, nativeDpr: 1 } }; assert.equal(policy.compareCaptureLanes(reports).pairs[0].nativeGeometryMatches, false);
});

test('capture boundaries retain write/context counters while RAF sample counts may advance', () => {
  const before = { nativeDpr: 2, buffer: { width: 1967, height: 1016 }, observation: { canvasWrites: 4, contextEvents: 0, dimensionSamples: 10 } };
  const after = { ...before, observation: { ...before.observation, dimensionSamples: 11 } };
  assert.deepEqual(policy.assessCaptureBoundary(before, after), { canvasWrites: 0, contextEvents: 0, dimensionSamples: 1 });
  assert.throws(() => policy.assessCaptureBoundary(before, { ...after, observation: { ...after.observation, canvasWrites: 5 } }), /canvasWrites/);
  assert.throws(() => policy.assessCaptureBoundary(before, { ...after, nativeDpr: 1 }), /Native buffer/);
});
test('two-model expectations remain immutable source identity rather than future harness policy', () => {
  assert.deepEqual(policy.captureModels.map(m => [m.path, m.bytes]), [['/models/r35-cabin-dashboard-5c0a9dca.glb', 19170816], ['/models/ciasny-r35.glb', 8296356]]);
  for (const model of policy.captureModels) assert.match(model.sha256, /^[a-f0-9]{64}$/);
});

test('equal initial snapshots cannot hide different actual capture buffers or missing boundary evidence', () => {
  const g = { nativeDpr: 2, viewport: { width: 1440, height: 900 }, canvas: { x: 0, y: 0, width: 1440, height: 744 }, buffer: { width: 1967, height: 1016 } };
  const reports = ['css', 'device'].map(scale => ({ viewport: 'desktop', scale, sourceCommit: policy.captureSource.sha, sourceTree: policy.captureSource.tree, initialGeometry: g, attempts: ['01-initial', '02-orbit'].map(label => ({ label, before: g, after: g })), result: 'observed' }));
  reports[1].attempts[1].after = { ...g, buffer: { width: 1440, height: 744 } };
  assert.equal(policy.compareCaptureLanes(reports).pairs[0].nativeGeometryMatches, false);
  delete reports[1].attempts[1].after;
  assert.equal(policy.compareCaptureLanes(reports).pairs[0].boundaryGeometryComplete, false);
});

test('same 2-CSS-pixel edge exclusion rejects a black scene with a bright rim at both output densities', () => {
  for (const factor of [1, 2, 3]) {
    const mapped = policy.mapCaptureGeometry({ png: { width: 100 * factor, height: 100 * factor }, viewport: { width: 100, height: 100 }, deviceScaleFactor: factor, scale: factor === 1 ? 'css' : 'device', bounds: { x: 0, y: 0, width: 100, height: 100 }, overlays: [] });
    const b = mapped.pixelBounds;
    // These are the existing pixel helpers' unmodified two-raster-pixel bounds.
    const left = Math.ceil(b.x + 2), top = Math.ceil(b.y + 2), right = Math.floor(b.x + b.width - 2), bottom = Math.floor(b.y + b.height - 2);
    assert.equal(left, 2 * factor); assert.equal(top, 2 * factor); assert.equal(right, 98 * factor); assert.equal(bottom, 98 * factor);
    let pixels = 0, black = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      pixels++; if (x >= 2 * factor && y >= 2 * factor && x < 98 * factor && y < 98 * factor) black++;
    }
    assert.equal(black / pixels, 1); assert(pixels > mapped.bounds.width * mapped.bounds.height / 2);
  }
});
