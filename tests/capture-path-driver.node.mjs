import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { main, installProtocolSink, runCaptureAttempt } from '../scripts/diagnose-capture-path.mjs';
test('driver rejects outside approved CI before runtime helpers, browser or server setup', async () => { await assert.rejects(main({}), /CI-only/); });
test('primary protocol attribution has zero debug-hook mutations or message serialization', () => {
  const debug = { get log() { throw new Error('must not inspect debug sink'); }, enable() { throw new Error('must not enable debug'); } };
  const sink = installProtocolSink({ enabled: false, debug }); sink.start(); sink.stop(); assert.equal(sink.snapshot().enabled, false);
});
test('optional attribution restores debug logging and retains metadata only', () => {
  let enabled = ''; const original = () => {}; const debug = { log: original, enable(value) { enabled = value; }, disable() { const old = enabled; enabled = ''; return old; } };
  const sink = installProtocolSink({ enabled: true, debug, phase: () => 'test' }); sink.start(); assert.equal(enabled, 'pw:protocol');
  debug.log('%s', 'SEND ► {"id":7,"method":"Page.captureScreenshot","sessionId":"one"}');
  debug.log('%s', '◀ RECV {"id":7,"result":{"data":"never-save-payload"},"sessionId":"one"}');
  sink.stop(); assert.equal(enabled, ''); assert.equal(debug.log, original); assert.equal(sink.snapshot().commands[0].status, 'replied'); assert.doesNotMatch(JSON.stringify(sink.snapshot()), /never-save-payload/);
});
test('workflow and script preserve capture-only scope, output-scale matrix and original deadlines', async () => {
  const script = await readFile(new URL('../scripts/diagnose-capture-path.mjs', import.meta.url), 'utf8');
  assert(script.indexOf('validateCaptureEnvironment(env)') < script.indexOf("await import('@playwright/test')"));
  assert.match(script, /reducedMotion: 'no-preference'/); assert.match(script, /timeout: 45_000/); assert.match(script, /captureWithTimeoutRetry/); assert.match(script, /mapCaptureGeometry/);
  assert.doesNotMatch(script, /reducedMotion: 'reduce'|animations: 'disabled'|setViewportSize|readPixels\(/);
  const workflow = await readFile(new URL('../.github/workflows/capture-path-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\[stage-capture-path\]/); assert.match(workflow, /scale: \[css, device\]/); assert.match(workflow, /viewport: \[desktop, mobile\]/);
});

test('reviewed primary request excludes protocol serialization and changing model policy', async () => {
  const request = JSON.parse(await readFile(new URL('../qa/capture-path-request.json', import.meta.url), 'utf8'));
  assert.equal(request.protocolAttribution, false); assert.equal(request.allow, true);
  const script = await readFile(new URL('../scripts/diagnose-capture-path.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /cabin-integration-policy/); assert.match(script, /const cabinModels = captureModels/);
});

test('pre/post geometry failures never suppress screenshot attempts or replace the screenshot error', async () => {
  const timeout = Object.assign(new Error('page.screenshot: Timeout 45000ms exceeded.'), { name: 'TimeoutError' });
  const row = {}; let calls = 0;
  const sink = installProtocolSink({ enabled: false });
  await assert.rejects(runCaptureAttempt({ row, geometry: async () => { throw new Error('geometry unavailable'); }, capture: async () => { calls++; throw timeout; }, sink, save: async () => {} }), error => error === timeout);
  assert.equal(calls, 1); assert.equal(row.result, 'failed'); assert.match(row.beforeGeometryError, /unavailable/); assert.match(row.afterGeometryError, /unavailable/);
});

test('orbit evidence requires completed scene-context frames and full original canvas coverage', async () => {
  const script = await readFile(new URL('../scripts/diagnose-capture-path.mjs', import.meta.url), 'utf8');
  assert.match(script, /sceneIds.has\(f.contextId\) && f.complete !== false/);
  assert.match(script, /summarizeScenePixels\(png, mapped.pixelBounds/);
  assert.match(script, /pixels.pixels > mapped.bounds.width \* mapped.bounds.height \/ 2/);
});
