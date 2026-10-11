/** Pure policy for a separate capture-path diagnostic. Never changes motion acceptance. */
import assert from 'node:assert/strict';
export const captureSource = Object.freeze({
  sha: '70b7644944f908a0dfad8999b0a44a61d84d5d4d',
  tree: 'cd008a4eb221e3323b988a9119e4f7f5109ad90dbf122b08b32127dfea4232a2',
});
export const captureModels = Object.freeze([
  { path: '/models/r35-cabin-dashboard-5c0a9dca.glb', bytes: 19_170_816, sha256: '5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326' },
  { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' },
]);
export const captureViewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
export function validateCaptureEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Capture diagnostic is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab', 'Exact reviewed repository required');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Exact main ref required');
  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Reviewed main push required');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/, 'Exact harness commit required');
  assert.ok((env.R35_CAPTURE_COMMIT_MESSAGE ?? '').includes('[stage-capture-path]'), 'Explicit capture-path marker required');
  assert.equal(env.R35_ALLOW_CAPTURE_PATH, '1', 'Explicit capture-path opt-in required');
  assert.equal(env.R35_CAPTURE_SOURCE_SHA, captureSource.sha, 'Only the exact reviewed fixed source is allowed');
  assert.equal(env.R35_CAPTURE_SOURCE_TREE, captureSource.tree, 'Exact reviewed fixed source tree required');
  assert.equal(env.R35_CAPTURE_BASE_URL, undefined, 'Arbitrary/public target forbidden');
  assert.ok(Object.hasOwn(captureViewports, env.R35_CAPTURE_VIEWPORT), 'Known capture viewport required');
  assert.ok(['css', 'device'].includes(env.R35_CAPTURE_SCALE), 'Capture output scale must be css or device');
  assert.ok(['0', '1'].includes(env.R35_CAPTURE_PROTOCOL), 'Protocol attribution must be explicit');
  assert.equal(env.DEBUG_FILE, undefined, 'Raw protocol file logging is forbidden');
  assert.equal(env.DEBUG, undefined, 'Ambient debug logging would contaminate the comparison');
  return { name: env.R35_CAPTURE_VIEWPORT, scale: env.R35_CAPTURE_SCALE, ...captureViewports[env.R35_CAPTURE_VIEWPORT], protocolAttribution: env.R35_CAPTURE_PROTOCOL === '1', baseUrl: 'http://127.0.0.1:4178' };
}
export function resolveCaptureRequest(request, env) {
  assert.deepEqual(Object.keys(request).sort(), ['allow', 'protocolAttribution', 'sourceSha', 'sourceTree', 'version']);
  assert.equal(request.version, 1); assert.equal(request.allow, true, 'Explicit boolean request allow=true required');
  assert.equal(typeof request.protocolAttribution, 'boolean', 'Attribution mode is explicit and primary runs keep it false');
  const values = { R35_ALLOW_CAPTURE_PATH: '1', R35_CAPTURE_SOURCE_SHA: request.sourceSha, R35_CAPTURE_SOURCE_TREE: request.sourceTree, R35_CAPTURE_PROTOCOL: request.protocolAttribution ? '1' : '0' };
  validateCaptureEnvironment({ ...env, ...values }); return values;
}
export function mapCaptureGeometry({ png, viewport, deviceScaleFactor, scale, bounds, overlays }) {
  assert.ok(['css', 'device'].includes(scale)); const factor = scale === 'device' ? deviceScaleFactor : 1;
  assert.equal(png.width, viewport.width * factor, 'PNG width must match exact capture scale');
  assert.equal(png.height, viewport.height * factor, 'PNG height must match exact capture scale');
  const mapped = rectangle => {
    assert([rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite), 'Measured CSS rectangle required');
    return { ...rectangle, x: rectangle.x * factor, y: rectangle.y * factor, width: rectangle.width * factor, height: rectangle.height * factor };
  };
  const canvas = mapped(bounds), adjustment = 2 * (factor - 1);
  // Existing pixel helpers inset by 2 raster pixels. Adapt their input so the final
  // sampled region retains the original 2 CSS-pixel inset at either PNG density.
  const pixelBounds = { ...canvas, x: canvas.x + adjustment, y: canvas.y + adjustment, width: canvas.width - adjustment * 2, height: canvas.height - adjustment * 2 };
  return { factor, bounds: canvas, pixelBounds, insetCssPixels: 2, overlays: overlays.map(mapped) };
}
/** Boundary counters are descriptive; geometry and native writes must remain stable. */
export function assessCaptureBoundary(before, after) {
  const { observation: beforeCounts, ...beforeGeometry } = before;
  const { observation: afterCounts, ...afterGeometry } = after;
  assert.deepEqual(afterGeometry, beforeGeometry, 'Native buffer/CSS/DPR/context changed across capture');
  for (const name of ['canvasWrites', 'contextEvents']) {
    assert(Number.isInteger(beforeCounts?.[name]) && Number.isInteger(afterCounts?.[name]), 'Native boundary counters required');
    assert.equal(afterCounts[name], beforeCounts[name], `${name} changed during capture`);
  }
  return { canvasWrites: afterCounts.canvasWrites - beforeCounts.canvasWrites, contextEvents: afterCounts.contextEvents - beforeCounts.contextEvents,
    dimensionSamples: afterCounts.dimensionSamples - beforeCounts.dimensionSamples };
}
/** Accept debug text transiently; retain only selected CDP IDs/methods/times, never payloads. */
export function createCaptureProtocolObserver({ now = () => performance.now(), phase = () => 'unknown', maxCommands = 256 } = {}) {
  const commands = [], pending = new Map(), issues = [];
  return {
    consume(text) {
      const outgoing = text.includes('SEND ► '), incoming = text.includes('◀ RECV '); if (!outgoing && !incoming) return;
      const id = /"id":(\d+)/.exec(text)?.[1], session = /"sessionId":"([^"]+)"/.exec(text)?.[1] ?? 'root';
      if (!id) return; const key = `${session}:${id}`;
      if (outgoing) {
        const method = /"method":"([^"]+)"/.exec(text)?.[1];
        if (!['Page.getLayoutMetrics', 'Page.captureScreenshot'].includes(method)) return;
        if (commands.length >= maxCommands) { if (!issues.includes('Protocol command capacity exceeded')) issues.push('Protocol command capacity exceeded'); return; }
        const command = { id: Number(id), sessionId: session, method, phase: phase(), sentAt: now(), status: 'pending' }; commands.push(command); pending.set(key, command);
      } else {
        const command = pending.get(key); if (!command) return;
        command.receivedAt = now(); command.durationMs = command.receivedAt - command.sentAt;
        command.status = /"error":\s*\{/.test(text) ? 'protocol-error' : 'replied'; pending.delete(key);
      }
    },
    snapshot() { return { commands: commands.map(c => ({ ...c })), issues: [...issues], limitation: 'Optional debug attribution serializes protocol bodies inside Playwright before this metadata-only sink; it is disabled for primary comparisons.' }; },
  };
}
export function compareCaptureLanes(reports) {
  const pairs = [], issues = [];
  for (const viewport of [...new Set(reports.map(r => r.viewport))]) {
    const lanes = reports.filter(r => r.viewport === viewport), css = lanes.find(r => r.scale === 'css'), device = lanes.find(r => r.scale === 'device');
    const geometry = g => g && { nativeDpr: g.nativeDpr, viewport: g.viewport, canvas: g.canvas, buffer: g.buffer };
    const expected = JSON.stringify(css?.initialGeometry);
    const boundaryGeometryComplete = Boolean(css && device && [css, device].every(r =>
      ['01-initial', '02-orbit'].every(label => r.attempts?.some(a => a.label === label)) &&
      r.attempts.every(a => a.before && a.after)));
    const nativeGeometryMatches = Boolean(boundaryGeometryComplete && css?.initialGeometry && device?.initialGeometry &&
      JSON.stringify(device.initialGeometry) === expected && [css, device].every(r =>
        r.attempts.every(a => [a.before, a.after].every(g => JSON.stringify(geometry(g)) === expected))));
    const exactSourceMatches = Boolean(css && device && [css, device].every(r => r.sourceCommit === captureSource.sha && r.sourceTree === captureSource.tree));
    if (lanes.length !== 2 || !css || !device) issues.push(`${viewport}: both unique capture-scale lanes required`);
    if (!nativeGeometryMatches || !exactSourceMatches) issues.push(`${viewport}: comparison invalid because source or native geometry differs/missing`);
    if (css?.protocolAttribution !== device?.protocolAttribution) issues.push(`${viewport}: attribution instrumentation differs between lanes`);
    pairs.push({ viewport, boundaryGeometryComplete, nativeGeometryMatches, exactSourceMatches, outcomes: { css: css?.result ?? 'missing', device: device?.result ?? 'missing' }, originalAcceptanceChanged: false });
  }
  return { scope: 'Capture-path discrimination only; original normal-motion acceptance remains failed/incomplete', pairs, issues };
}
