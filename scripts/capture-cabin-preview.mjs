/** CI-only proof of the built production configurator, never the separate QA scene. */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAppServer } from '../server.mjs';

import { verifyReleaseAssets } from './verify-release-assets.mjs';
import { waitForCabinWindowReady } from './cabin-capture-readiness.mjs';
import { installFunctionalCaptureObserver, armFunctionalCapture, waitForFunctionalCapture, verifyFunctionalCapture } from './functional-capture-readiness.mjs';
import { measureCabinWindowLayout, assertCabinWindowLayout } from './cabin-window-layout.mjs';
import { installCabinResourceObserver } from './cabin-resource-observer.mjs';
import { installCabinLoadLifecycle, observeCabinLoadNetwork, observeCabinFaultResponse, cabinLoadTime, correlateCabinLoadRequests } from './cabin-load-lifecycle.mjs';
import { cabinResourceCohort, assertCabinResourcesReleased } from './cabin-resource-assertions.mjs';
import {
  cabinModels, assertCabinModelRequests, networkFaultHeader, resolveCabinTarget, verifyPublicCabinModels, observeCabinRuntimeBodies,
  createLiveCabinFaults, isExpectedCabinRequestFailure, isExpectedCabinBodyError, isExpectedCabinWarning, correlateCabinConsole404,
} from './cabin-integration-policy.mjs';
export { resolveCabinTarget, verifyPublicCabinModels, createLiveCabinFaults, isExpectedCabinRequestFailure, isExpectedCabinBodyError, isExpectedCabinWarning, correlateCabinConsole404 } from './cabin-integration-policy.mjs';

export async function main() {
// Local browser/server execution is deliberately disabled. This check must run
// only in the reviewed, explicitly opted-in GitHub Actions job.
const target = resolveCabinTarget(process.env);
const live = target.mode === 'live';
const selectedViewport = process.env.R35_QA_VIEWPORT;
const viewport = selectedViewport === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const { output, baseUrl } = target;
const [cabinModel, exteriorModel, proxyModel] = cabinModels;
const cabinPath = cabinModel.path, exteriorPath = exteriorModel.path, proxyPath = proxyModel.path;
const cabinSha256 = cabinModel.sha256, exteriorSha256 = exteriorModel.sha256;
const cabinBytes = cabinModel.bytes;
const imageManifest = JSON.parse(await readFile('qa/cabin-preview/realism-images.json', 'utf8'));
assert.equal(imageManifest.assetSha256, cabinSha256);
assert.equal(imageManifest.assetBytes, cabinBytes);
const expectedImages = imageManifest.images;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {
  commit: process.env.GITHUB_SHA, viewport: { name: selectedViewport, ...viewport }, result: 'running',
  mode: target.mode,
  scope: live ? 'Actual public Railway app after exact HTML/JS/CSS and GLB preflight. One request-scoped 404 per optional cabin/proxy is intercepted; partial downloads use real public bytes under CDP throttling. No local server; explicitly opted-in read-only functional rendering observation.' : 'Actual npm-built production app with exact reviewed assets. Network faults are injected only by this CI test server; explicitly opted-in read-only functional rendering observation; no alternate scene.',
  functionalObservation: 'Explicit opt-in read-only production main-draw and native-batch completion seam; not native-motion acceptance',
  renderer: 'Chromium ANGLE SwiftShader software WebGL; no physical-device FPS or performance claim',
  expectedAssets: { cabin: { path: cabinPath, sha256: cabinSha256, bytes: cabinBytes }, exterior: { path: exteriorPath, sha256: exteriorSha256, bytes: exteriorModel.bytes }, proxy: { ...proxyModel } },
  loadLifecycle: { browser: null, network: { requests: [], issues: [] }, correlations: [], issues: [] },
  resourceEvidence: [], checks: [], frames: [], requests: [], responses: [], requestFailures: [], console: [], pageErrors: [], runtimeAssetErrors: [], errors: [], networkFaults: [], networkConsole: [], networkResponses: [],
  remaining: ['Physical-device performance, Safari/WebKit and Android device behavior are not measured', 'Late GPU/decoder callbacks are covered by production unit tests; browser faults specifically exercise aborted streaming responses and route teardown', ...(live ? ['Deterministic held-proxy and full/proxy arrival-order faults run only in the local-production CI matrix; public verification does not alter proxy response bodies or globally throttle initial exterior loading'] : [])],
};
await mkdir(output, { recursive: true });
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
let browser, server, page, observer, originalCanvas, liveFaults, runtimeBodies, loadNetwork;
let nextFault = null;
let phase = 'setup';
const snapshotLoadLifecycle = async stage => {
  if (!page || page.isClosed()) return;
  report.loadLifecycle.stage = stage;
  report.loadLifecycle.browser = await page.evaluate(() => globalThis.__cabinLoadLifecycle?.snapshot() ?? null).catch(error => { report.loadLifecycle.issues.push(String(error)); return null; });
  report.loadLifecycle.correlations = correlateCabinLoadRequests(report.requests, report.loadLifecycle.browser, report.loadLifecycle.network);
};
let cabinAttemptMark;
const pendingGates = new Set();
const requestIds = new WeakMap();
let nextRequestId = 1;
const requestId = request => {
  if (!requestIds.has(request)) requestIds.set(request, nextRequestId++);
  return requestIds.get(request);
};
const assetCounts = () => ({
  exterior: report.requests.filter(item => item.path === exteriorPath).length,
  cabin: report.requests.filter(item => item.path === cabinPath).length,
  proxy: report.requests.filter(item => item.path === proxyPath).length,
});
const check = async (name, run) => {
  phase = name;
  const started = Date.now();
  try { const details = await run(); report.checks.push({ name, result: 'passed', elapsedMs: Date.now() - started, ...(details ?? {}) }); }
  catch (error) { report.checks.push({ name, result: 'failed', elapsedMs: Date.now() - started, error: String(error) }); throw error; }
  finally { await save(); }
};

try {
  const cabin = await readFile(`dist${cabinPath}`);
  assert.equal(cabin.length, cabinBytes, 'Built cabin byte length is exact');
  assert.equal(hash(cabin), cabinSha256, 'Built cabin is the reviewed asset');
  assert.equal(hash(await readFile(`dist${exteriorPath}`)), exteriorSha256, 'Built exterior remains unchanged');
  const proxy = await readFile(`dist${proxyPath}`);
  assert.equal(proxy.length, proxyModel.bytes, 'Built proxy byte length is exact');
  assert.equal(hash(proxy), proxyModel.sha256, 'Built proxy has the exact reviewed identity');
  const proxyJson = JSON.parse(proxy.subarray(20, 20 + proxy.readUInt32LE(12)).toString('utf8').trim());
  assert.equal(proxyJson.images?.length ?? 0, 0, 'The lightweight proxy adds no image decodes');
  if (live) {
    report.releaseAssets = await verifyReleaseAssets();
    report.publicModels = await verifyPublicCabinModels();
    await save();
  } else {
  // Delegate every ordinary request to the real production server. Only the
  // next explicitly armed optional-model request gets a deterministic network fault.
  const production = createAppServer();
  const productionHandler = production.listeners('request')[0];
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path !== nextFault?.path || !nextFault) { void productionHandler(request, response); return; }
    const fault = nextFault; nextFault = null;
    fault.started = true;
    observeCabinFaultResponse(request, response, fault);
    if (fault.kind === 'missing') {
      response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', [networkFaultHeader]: fault.kind });
      response.end('Intentional cabin-only 404 for recovery verification');
      fault.finished = true;
      return;
    }
    const bytes = path === proxyPath ? proxy : cabin;
    const partialBytes = path === proxyPath ? 65_536 : 1_048_576;
    // Match production GLB transport. Chromium 153 misreports no-store stream
    // EOF as ERR_ABORTED (upstream fix 62473ad0f747e245e514c93e741bb8e168a2a207).
    // Network.setCacheDisabled below still forces every real request/body.
    response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': bytes.length, 'Cache-Control': 'public,max-age=3600', [networkFaultHeader]: fault.kind });
    // These are genuine model bytes, not an invented percentage. Holding the
    // remaining body makes partial byte progress and cancellation deterministic.
    response.write(bytes.subarray(0, partialBytes));
    fault.sentBytes = partialBytes;
    fault.release = () => {
      fault.lifecycle.releaseInvoked ??= cabinLoadTime();
      fault.lifecycle.releaseCalls = (fault.lifecycle.releaseCalls ?? 0) + 1;
      fault.released = true;
      fault.clientAlreadyClosed = response.destroyed;
      if (!response.destroyed) response.end(bytes.subarray(partialBytes));
      pendingGates.delete(fault);
    };
    response.once('close', () => { fault.closed = true; });
    pendingGates.add(fault);
  });
  server.requestTimeout = 90_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', resolve); });
  }
  report.baseUrl = baseUrl;
  browser = await chromium.launch({ timeout: 30_000, args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  ] });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block',
    ...(selectedViewport === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addInitScript(installFunctionalCaptureObserver);
  await context.addInitScript(installCabinResourceObserver, { expectedImages });
  await context.addInitScript(installCabinLoadLifecycle, { urls: cabinModels.map(model => baseUrl + model.path) });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(45_000);
  const cdp = await context.newCDPSession(page);
  loadNetwork = observeCabinLoadNetwork(cdp, cabinModels.map(model => baseUrl + model.path), () => phase, report.loadLifecycle.network);
  runtimeBodies = await observeCabinRuntimeBodies({ cdp, baseUrl, responses: report.networkResponses, errors: report.runtimeAssetErrors, phase: () => phase });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (live) liveFaults = createLiveCabinFaults({ page, cdp, cabinUrl: baseUrl + cabinPath, requestId, faults: report.networkFaults });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.source === 'network' && entry.level === 'error') report.networkConsole.push(entry); });
  await cdp.send('Log.enable');
  page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    const location = message.location();
    report.console.push({ phase, type: message.type(), text: message.text(), location });
  });
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    liveFaults?.onRequest(request);
    if (path.endsWith('.glb')) report.requests.push({ requestId: requestId(request), phase, path, url: request.url(), method: request.method(), ordinal: report.requests.filter(item => item.url === request.url()).length + 1, observedAt: cabinLoadTime() });
  });
  page.on('requestfailed', request => {
    liveFaults?.onFailed(request);
    report.requestFailures.push({ requestId: requestId(request), phase, path: new URL(request.url()).pathname, failure: request.failure()?.errorText, observedAt: cabinLoadTime() });
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (!cabinModels.some(model => model.path === path)) return;
    const record = { requestId: requestId(response.request()), phase, path, status: response.status(), observedAt: cabinLoadTime(), injectedFault: response.headers()[networkFaultHeader] };
    if (live) record.injectedFault = report.networkFaults.find(fault => fault.requestId === record.requestId)?.kind;
    else if (record.injectedFault) {
      const fault = report.networkFaults.findLast(item => item.kind === record.injectedFault && item.path === path && item.started && item.requestId === undefined);
      assert.ok(fault, 'Marked local response belongs to an armed fault');
      fault.requestId = record.requestId;
    }
    record.url = response.url();
    assert.equal(record.url, baseUrl + path, 'Runtime model remains on the exact verification origin');
    report.responses.push(record);
  });
  const resourceSnapshot = async () => page.evaluate(async () => {
    await globalThis.__cabinResourceObserver.settleIdentities();
    return globalThis.__cabinResourceObserver.snapshot();
  });
  const activeResources = async label => {
    const snapshot = await resourceSnapshot();
    const cohort = cabinResourceCohort(cabinAttemptMark, snapshot, expectedImages);
    report.resourceEvidence.push({ label, cohort, snapshot });
    return cohort;
  };
  const releasedResources = async (cohort, label) => {
    let snapshot, details;
    await expect.poll(async () => {
      snapshot = await resourceSnapshot();
      try { details = assertCabinResourcesReleased(cohort, snapshot); return true; }
      catch (error) { return String(error); }
    }, { timeout: 5_000, message: label }).toBe(true);
    report.resourceEvidence.push({ label, details, snapshot });
  };
  const canvas = page.locator('.scene-stage canvas');
  const controls = page.locator('footer[aria-label="Cabin preview controls"]');
  const cameraButton = page.getByRole('button', { name: 'Camera', exact: true });
  const frames = async (count = 6) => page.evaluate(count => new Promise(resolve => {
    const frame = () => --count ? requestAnimationFrame(frame) : resolve(); requestAnimationFrame(frame);
  }), count);
  const assertLayout = async () => {
    const measurements = await page.evaluate(() => {
      const rail = document.querySelector('footer[aria-label="Cabin preview controls"]');
      const buttons = [...(rail?.querySelectorAll('button') ?? [])].map(button => {
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { text: button.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, unobscured: button === hit || button.contains(hit) };
      });
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons };
    });
    assert.ok(measurements.scrollWidth <= measurements.width + 1, 'No horizontal overflow');
    for (const button of measurements.buttons) {
      assert.ok(button.x >= -1 && button.y >= -1 && button.right <= measurements.width + 1 && button.bottom <= measurements.height + 1, `${button.text} fits the viewport`);
      assert.ok(button.height >= 43 && button.unobscured, `${button.text} is a usable, unobscured target`);
    }
    const windowStatus = await page.evaluate(measureCabinWindowLayout);
    assertCabinWindowLayout(windowStatus);
    return { ...measurements, windowStatus };
  };
  let expectedPreset = 'hero';
  const capture = async label => {
    // Verify focus at the call site first, then remove focus-visible styling
    // from overlapping production controls so the pixel proof measures the
    // restored rendering rather than keyboard-versus-pointer modality.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.mouse.move(0, 0);
    await waitForFunctionalCapture(page, { preset: expectedPreset, timeout: 20_000 });
    const png = await canvas.screenshot({ path: `${output}/${selectedViewport}-${label}-canvas.png`, animations: 'disabled', timeout: 45_000 });
    await page.screenshot({ path: `${output}/${selectedViewport}-${label}-page.png`, fullPage: true, animations: 'disabled', scale: 'css', timeout: 45_000 });
    const readiness = await verifyFunctionalCapture(page);
    report.frames.push({ label, readiness, canvasSha256: hash(png), layout: await assertLayout() });
    await save();
    return png;
  };
  const comparePixels = async (before, after, label) => {
    const comparison = await page.evaluate(async ({ before, after }) => {
      const decode = async encoded => {
        const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
        const surface = document.createElement('canvas'); surface.width = image.width; surface.height = image.height;
        const context = surface.getContext('2d'); context.drawImage(image, 0, 0);
        return { width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data };
      };
      const a = await decode(before), b = await decode(after);
      if (a.width !== b.width || a.height !== b.height) return { dimensionsMatch: false };
      let changedPixels = 0, maxChannelDelta = 0;
      for (let pixel = 0; pixel < a.pixels.length; pixel += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(a.pixels[pixel + channel] - b.pixels[pixel + channel]);
          if (delta) changed = true;
          maxChannelDelta = Math.max(maxChannelDelta, delta);
        }
        if (changed) changedPixels++;
      }
      return { dimensionsMatch: true, totalPixels: a.width * a.height, changedPixels, maxChannelDelta };
    }, { before: before.toString('base64'), after: after.toString('base64') });
    report.checks.push({ name: label, result: comparison.dimensionsMatch && comparison.changedPixels === 0 ? 'passed' : 'failed', pixelComparison: comparison });
    assert.ok(comparison.dimensionsMatch && comparison.changedPixels === 0, `${label}: restore exact exterior pixels`);
  };
  const readyExterior = async ({ window = true } = {}) => {
    await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
    if (window) {
      await waitForCabinWindowReady(page);
      await expect(page.locator('.cabin-window-status')).toBeVisible();
    }
    await frames();
  };
  const sameExterior = async expectedRequests => {
    await expect(canvas).toHaveCount(1);
    assert.equal(await originalCanvas.evaluate(element => element.isConnected && element === document.querySelector('.scene-stage canvas')), true, 'The original canvas remains mounted');
    assert.equal(assetCounts().exterior, expectedRequests, 'Cabin interaction does not download the exterior again');
    const observations = await observer.evaluate(state => state.events);
    assert.deepEqual(observations, [], 'No canvas removal, replacement or duplicate during cabin interaction');
  };
  const startObserver = async () => {
    originalCanvas = await canvas.elementHandle();
    observer = await page.evaluateHandle(() => {
      const original = document.querySelector('.scene-stage canvas');
      const state = { events: [] };
      const observe = new MutationObserver(records => {
        for (const record of records) for (const node of record.removedNodes) {
          if (node === original || node.contains?.(original)) state.events.push({ kind: 'original-removed' });
        }
        const canvases = [...document.querySelectorAll('.scene-stage canvas')];
        if (canvases.length !== 1 || canvases[0] !== original) state.events.push({ kind: 'canvas-set-changed', count: canvases.length });
      });
      observe.observe(document.body, { childList: true, subtree: true });
      return { ...state, stop: () => observe.disconnect() };
    });
  };
  const stopObserver = async () => { await observer?.evaluate(state => state.stop()); await observer?.dispose(); observer = null; };
  const openCabin = async () => {
    await armFunctionalCapture(page, { allowUnchanged: true });
    cabinAttemptMark = await page.evaluate(() => globalThis.__cabinResourceObserver.mark('cabin-attempt'));
    await cameraButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cabin preview · work in progress', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(controls).toBeVisible();
  };
  const activeCabin = async () => {
    await expect(controls.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('aria-label', /fixed seat/);
    await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toBeDisabled();
    await assertLayout();
  };
  const armFault = async (kind, path = cabinPath) => {
    assert.ok([cabinPath, proxyPath].includes(path), 'Faults target only a reviewed optional model');
    if (live) return liveFaults.arm(kind, phase, path);
    assert.equal(nextFault, null, 'One network fault at a time');
    const fault = { kind, phase, path, armedAt: cabinLoadTime() };
    report.networkFaults.push(fault); nextFault = fault; return fault;
  };
  const assertPartialDownload = async () => {
    await expect(controls.getByRole('button', { name: 'Cancel cabin loading', exact: true })).toBeVisible();
    const progress = controls.getByRole('progressbar', { name: 'Cabin download', exact: true });
    await expect(progress).toHaveAttribute('max', String(cabinBytes));
    if (live) {
      await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(0);
      const bytes = Number(await progress.getAttribute('value'));
      assert.ok(bytes > 0 && bytes < cabinBytes, 'Public cabin reports genuine partial downloaded bytes');
      const fault = report.networkFaults.findLast(item => item.kind === 'throttled-stream');
      assert.ok(Number.isSafeInteger(fault?.requestId), 'Partial progress belongs to the armed public request');
      fault.observedPartialBytes = bytes;
      await expect(controls.getByRole('status')).toContainText('/ 19.2 MB');
    } else {
      await expect(progress).toHaveAttribute('value', '1048576');
      await expect(controls.getByRole('status')).toContainText('1.0 MB / 19.2 MB');
    }
  };
  const releaseAborted = async fault => {
    await expect.poll(() => fault.closed === true, { timeout: 5_000 }).toBe(true);
    await fault.release();
    assert.equal(fault.clientAlreadyClosed, true, 'Opt-out aborted the in-flight network stream');
    await frames();
  };

  const pendingWindow = async fault => {
    await expect.poll(() => fault.started === true && fault.sentBytes === 65_536 && Number.isSafeInteger(fault.requestId), { timeout: 15_000, message: 'Actual proxy response is held after exactly 64 KiB' }).toBe(true);
    await expect(page.locator('.cabin-window-status')).toBeVisible();
    await expect(page.locator('.cabin-window-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('.cabin-window-status')).toHaveText('Loading window view…');
    await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Lights', exact: true })).toBeEnabled();
    await expect(cameraButton).toBeEnabled();
    await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0);
  };

  await check('Initial exterior, WebGL and opt-in boundary', async () => {
    const fault = live ? null : await armFault('held-stream', proxyPath);
    await page.goto(`${baseUrl}/configurator/premium`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/configurator/premium');
    await expect(page.getByRole('heading', { name: 'GT-R R35', exact: true })).toBeVisible();
    await readyExterior({ window: !fault });
    if (fault) {
      await pendingWindow(fault);
      assert.equal(assetCounts().cabin, 0, 'An automatic proxy never starts the full cabin');
      await capture('window-proxy-pending-controls-available');
      await fault.release();
      await waitForCabinWindowReady(page);
    }
    assert.deepEqual(assetCounts(), { exterior: 1, cabin: 0, proxy: 1 });
    report.webgl = await canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      if (!gl || gl.isContextLost()) return null;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null };
    });
    assert.ok(report.webgl, 'An actual live WebGL context exists');
    await cameraButton.click();
    await expect(page.getByRole('dialog')).toContainText('19.2 MB');
    assert.equal(assetCounts().cabin, 0, 'Opening Camera does not fetch the cabin');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await startObserver();
  });
  const exteriorBefore = await capture('exterior-before');

  await check('Ready proxy through front-side rear-side and opposite-side exterior views', async () => {
    const before = assetCounts();
    const views = [];
    for (const [preset, label] of [['Front ¾', 'window-front-side'], ['Rear ¾', 'window-rear-side'], ['Side', 'window-opposite-side']]) {
      await cameraButton.click();
      await armFunctionalCapture(page, { cameraRequest: true });
      expectedPreset = ({ 'Front ¾': 'hero', 'Rear ¾': 'rear-quarter', Side: 'side' })[preset];
      await page.getByRole('dialog').getByRole('button', { name: preset, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await waitForCabinWindowReady(page); await frames();
      if (label === 'window-opposite-side') {
        // Real production keyboard orbit, approximately half a turn from Side.
        await canvas.focus();
        for (let step = 0; step < 20; step++) await page.keyboard.press('Shift+ArrowRight');
      }
      views.push(hash(await capture(label)));
    }
    assert.equal(new Set(views).size, 3, 'The outside-window evidence includes three different actual views');
    assert.deepEqual(assetCounts(), before, 'Exterior inspection reuses one proxy without fetching the full cabin');
    await cameraButton.click();
    await armFunctionalCapture(page, { cameraRequest: true }); expectedPreset = 'hero';
    await page.getByRole('dialog').getByRole('button', { name: 'Front ¾', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await sameExterior(1);
    await comparePixels(exteriorBefore, await capture('exterior-after-window-views'), 'Exterior view inspection resets to the exact ready baseline');
  });

  await check('Delayed download cancel and stale response ignored', async () => {
    const fault = await armFault('held-stream');
    await openCabin(); await assertPartialDownload();
    await capture('loading-partial-bytes');
    await sameExterior(1);
    await armFunctionalCapture(page, { allowUnchanged: true });
    await controls.getByRole('button', { name: 'Cancel cabin loading', exact: true }).click();
    await expect(controls).toHaveCount(0);
    await expect(cameraButton).toBeFocused();
    await releaseAborted(fault);
    await delay(1_000); // Finite stale-response observation after the held stream closes.
    await expect(controls).toHaveCount(0);
    await sameExterior(1);
    await comparePixels(exteriorBefore, await capture('exterior-after-cancel'), 'Cancel preserves exterior pixels');
  });

  await check('Missing cabin preserves exterior and Retry loads real asset', async () => {
    await armFault('missing'); await openCabin();
    await expect(controls.getByRole('alert')).toContainText('HTTP 404');
    await expect(controls.getByRole('button', { name: 'Retry cabin preview', exact: true })).toBeVisible();
    await sameExterior(1);
    await comparePixels(exteriorBefore, await capture('cabin-missing-fallback'), 'Missing cabin preserves exterior pixels');
    const before = assetCounts().cabin;
    await controls.getByRole('button', { name: 'Retry cabin preview', exact: true }).click();
    await activeCabin();
    assert.equal(assetCounts().cabin, before + 1, 'Retry starts one new cabin download');
    await sameExterior(1);
  });

  await check('Three production seat views and keyboard/touch look', async () => {
    const seatFrames = [];
    for (const seat of ['Driver', 'Passenger', 'Rear seat']) {
      await page.evaluate(label => globalThis.__cabinResourceObserver.mark(label), `seat-${seat}`);
      await armFunctionalCapture(page, { allowUnchanged: seat === 'Driver' });
      await controls.getByRole('button', { name: seat, exact: true }).click();
      await expect(controls.getByRole('button', { name: seat, exact: true })).toHaveAttribute('aria-pressed', 'true');
      seatFrames.push(hash(await capture(`seat-${seat.toLowerCase().replaceAll(' ', '-')}`)));
    }
    assert.equal(new Set(seatFrames).size, 3, 'All three actual seat views differ');
    await armFunctionalCapture(page);
    await controls.getByRole('button', { name: 'Driver', exact: true }).click();
    const before = await capture('driver-before-look');
    await canvas.focus();
    await page.evaluate(() => globalThis.__cabinResourceObserver.mark('driver-arrow-look'));
    await armFunctionalCapture(page);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
    const arrow = await capture('driver-arrow-look');
    assert.notEqual(hash(arrow), hash(before), 'Arrow keys change actual rendered cabin pixels');
    await expect(controls.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (selectedViewport === 'mobile') {
      const box = await canvas.boundingBox(); assert.ok(box);
      const x = Math.round(box.x + box.width * .5), y = Math.round(box.y + box.height * .4);
      await page.evaluate(() => globalThis.__cabinResourceObserver.mark('driver-touch-look'));
      await armFunctionalCapture(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 5; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 12, y: y + step * 4 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const touch = await capture('driver-touch-look');
      assert.notEqual(hash(touch), hash(arrow), 'Real touch input changes rendered pixels');
      await expect(controls.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await sameExterior(1);
  });

  await check('Back and foreground-modal Escape restore exact exterior', async () => {
    const backCohort = await activeResources('all-seats-active');
    await armFunctionalCapture(page);
    await controls.getByRole('button', { name: 'Back to exterior', exact: true }).click();
    await expect(controls).toHaveCount(0); await expect(cameraButton).toBeFocused();
    await sameExterior(1);
    await releasedResources(backCohort, 'Back closes all candidate bitmaps and deletes uploaded textures');
    await comparePixels(exteriorBefore, await capture('exterior-after-back'), 'Back restores exterior pixels');
    await openCabin(); await activeCabin(); await frames();
    const escapeCohort = await activeResources('second-entry-active');
    await page.getByRole('button', { name: 'Model detail', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await activeCabin();
    await armFunctionalCapture(page);
    await page.keyboard.press('Escape');
    await expect(controls).toHaveCount(0); await expect(cameraButton).toBeFocused();
    await sameExterior(1);
    await releasedResources(escapeCohort, 'Escape releases the second candidate load without retained resources');
    await comparePixels(exteriorBefore, await capture('exterior-after-escape'), 'Escape restores exterior pixels');
    return { requestsBeforeIntentionalRemounts: assetCounts(), canvasRemounts: 0 };
  });
  await stopObserver();

  const switchModel = async id => {
    await armFunctionalCapture(page, { replacement: true }); expectedPreset = 'hero';
    const names = { premium: /^Premium /, nismo: /^NISMO /, tspec: /^T-spec /, gtr50: /^GT-R50 /, gt3: /^GT3 /, gt500: /^GT500 / };
    await page.getByRole('button', { name: 'Switch model', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: names[id] }).click();
    await expect(page).toHaveURL(new RegExp(`/configurator/${id}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };
  const photoOnly = async () => {
    // React's route effect + reduced-motion drawer removal should finish within
    // this focused 5s bound. Do not mask a stale canvas with the 90s model budget.
    await expect(canvas).toHaveCount(0, { timeout: 5_000 });
    await expect(controls).toHaveCount(0);
    await expect(page.locator('.cabin-window-status')).toHaveCount(0);
    await expect(page.locator('.reference-view img')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Photo reference · 3D asset pending', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Lights', exact: true })).toBeDisabled();
    await assertLayout();
  };
  const watchNoResurrection = async (release = async () => {}) => {
    const watch = await page.evaluateHandle(() => {
      const state = { addedCanvases: 0 };
      const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === 1) state.addedCanvases += (node.matches('canvas') ? 1 : 0) + node.querySelectorAll('canvas').length;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return { state, stop: () => observer.disconnect() };
    });
    const before = assetCounts();
    try {
      await release(); await delay(2_000);
      await photoOnly();
      assert.equal(await watch.evaluate(value => value.state.addedCanvases), 0, 'No late callback resurrected a canvas');
      assert.deepEqual(assetCounts(), before, 'No late callback restarted any of the three asset downloads');
    } finally { await watch.evaluate(value => value.stop()); await watch.dispose(); }
  };
  await check('In-flight cabin switch tears down and all other five stay photographic', async () => {
    const fault = await armFault('held-stream'); await openCabin(); await assertPartialDownload();
    await switchModel('nismo'); await photoOnly();
    await watchNoResurrection(() => releaseAborted(fault));
    for (const id of ['nismo', 'tspec', 'gtr50', 'gt3', 'gt500']) {
      if (id !== 'nismo') await switchModel(id);
      await photoOnly();
      const before = assetCounts();
      await cameraButton.click();
      await expect(page.getByRole('dialog').getByRole('button', { name: /Interior/ })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Cabin preview · work in progress', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.deepEqual(assetCounts(), before, `${id} remains photo-only`);
      await page.screenshot({ path: `${output}/${selectedViewport}-photo-${id}-page.png`, fullPage: true, animations: 'disabled', timeout: 30_000 });
    }
    assert.equal(assetCounts().exterior, 1, 'Photo-only routes never reload the exterior');
  });
  await check('Active cabin switch tears down without resurrection', async () => {
    await switchModel('premium'); await readyExterior();
    assert.equal(assetCounts().exterior, 2, 'Returning to Premium intentionally mounts one fresh exterior');
    await comparePixels(exteriorBefore, await capture('exterior-after-route-return'), 'Route return has no stale cabin materials');
    await startObserver(); await openCabin(); await activeCabin(); await sameExterior(2); await frames();
    const routeCohort = await activeResources('route-exit-active'); await stopObserver();
    await switchModel('nismo'); await photoOnly();
    await releasedResources(routeCohort, 'Active route exit releases every candidate bitmap and GPU texture');
    await watchNoResurrection();
  });
  await check('Real WebGL context loss and explicit viewer retry', async () => {
    await switchModel('premium'); await readyExterior(); await openCabin(); await activeCabin(); await frames();
    const contextCohort = await activeResources('context-loss-active');
    const before = assetCounts();
    const supported = await canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return false; extension.loseContext(); return true;
    });
    assert.equal(supported, true, 'Standard WebGL context-loss extension exists in CI');
    await expect(page.locator('.render-error')).toContainText('graphics connection was lost');
    await expect(canvas).toHaveCount(0, { timeout: 5_000 });
    await expect(controls).toHaveCount(0);
    const contextSnapshot = await resourceSnapshot();
    for (const id of contextCohort.bitmapIds) assert.equal(contextSnapshot.bitmaps.find(item => item.id === id)?.closeCalls, 1, 'Context-loss cleanup closes each candidate bitmap');
    report.resourceEvidence.push({ label: 'Context-loss cleanup, GPU context invalidated separately from live-context deletion', cohort: contextCohort, snapshot: contextSnapshot });
    await page.screenshot({ path: `${output}/${selectedViewport}-context-lost-page.png`, fullPage: true, animations: 'disabled', timeout: 30_000 });
    await armFunctionalCapture(page, { replacement: true });
    await page.getByRole('button', { name: 'Try again', exact: true }).click(); await readyExterior();
    assert.equal(assetCounts().exterior, before.exterior + 1, 'Explicit recovery downloads exactly one exterior');
    assert.equal(assetCounts().cabin, before.cabin, 'Recovery does not silently opt into the cabin');
    assert.equal(assetCounts().proxy, before.proxy + 1, 'Explicit viewer recovery downloads exactly one fresh window proxy');
    await capture('context-recovered-exterior');
  });

  await check('Missing window proxy is nonblocking and a fresh Premium entry retries it', async () => {
    await switchModel('nismo'); await photoOnly();
    const before = assetCounts();
    await armFault('missing', proxyPath);
    await switchModel('premium'); await readyExterior({ window: false });
    await expect(page.locator('.cabin-window-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('.cabin-window-status')).toHaveText('Window view unavailable');
    await expect(page.locator('.cabin-window-status')).toBeVisible();
    await expect(cameraButton).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Lights', exact: true })).toBeEnabled();
    assert.equal(assetCounts().proxy, before.proxy + 1, 'Failed proxy is attempted once');
    assert.equal(assetCounts().cabin, before.cabin, 'Proxy failure cannot opt into the detailed cabin');
    const unavailableExterior = await capture('window-proxy-unavailable');
    await openCabin(); await activeCabin(); await capture('full-cabin-with-proxy-unavailable');
    const cohort = await activeResources('full-cabin-independent-of-proxy-failure');
    await armFunctionalCapture(page);
    await controls.getByRole('button', { name: 'Back to exterior', exact: true }).click();
    await expect(controls).toHaveCount(0);
    await releasedResources(cohort, 'Proxy failure does not weaken full-cabin resource teardown');
    await comparePixels(unavailableExterior, await capture('proxy-unavailable-after-back'), 'Failed proxy preserves the same exterior after full-cabin exit');
    await switchModel('nismo'); await photoOnly();
    await switchModel('premium'); await readyExterior();
    assert.equal(assetCounts().proxy, before.proxy + 2, 'Fresh Premium entry retries the unavailable proxy exactly once');
    await comparePixels(exteriorBefore, await capture('window-proxy-recovered'), 'Fresh proxy recovery restores the ready exterior baseline');
  });

  if (!live) {
    await check('In-flight window proxy model switch cancels without late resurrection', async () => {
      await switchModel('nismo'); await photoOnly();
      const fault = await armFault('held-stream', proxyPath);
      await switchModel('premium'); await readyExterior({ window: false }); await pendingWindow(fault);
      const before = assetCounts();
      await switchModel('nismo'); await photoOnly();
      await watchNoResurrection(() => releaseAborted(fault));
      assert.equal(assetCounts().cabin, before.cabin, 'Proxy cancellation never starts a full-cabin load');
      await switchModel('premium'); await readyExterior();
      assert.equal(assetCounts().proxy, before.proxy + 1, 'Route return starts one new proxy after cancelling the prior attempt');
    });

    await check('In-flight window proxy context-loss cancel and explicit viewer retry', async () => {
      await switchModel('nismo'); await photoOnly();
      const fault = await armFault('held-stream', proxyPath);
      await switchModel('premium'); await readyExterior({ window: false }); await pendingWindow(fault);
      const before = assetCounts();
      const supported = await canvas.evaluate(element => {
        const gl = element.getContext('webgl2') || element.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension) return false; extension.loseContext(); return true;
      });
      assert.equal(supported, true, 'Standard context-loss extension exists while the proxy is pending');
      await expect(page.locator('.render-error')).toContainText('graphics connection was lost');
      await expect(canvas).toHaveCount(0, { timeout: 5_000 });
      await expect(controls).toHaveCount(0);
      await releaseAborted(fault);
      await armFunctionalCapture(page, { replacement: true });
    await page.getByRole('button', { name: 'Try again', exact: true }).click(); await readyExterior();
      assert.equal(assetCounts().exterior, before.exterior + 1, 'Explicit recovery starts one new exterior');
      assert.equal(assetCounts().proxy, before.proxy + 1, 'Explicit recovery starts one fresh proxy attempt');
      assert.equal(assetCounts().cabin, before.cabin, 'Pending-proxy recovery does not opt into the full cabin');
      await comparePixels(exteriorBefore, await capture('pending-proxy-context-recovered'), 'Context retry has no stale proxy state');
    });

    await check('Full cabin arrives before proxy and late proxy remains hidden', async () => {
      await switchModel('nismo'); await photoOnly();
      const fault = await armFault('held-stream', proxyPath);
      await switchModel('premium'); await readyExterior({ window: false }); await pendingWindow(fault);
      const before = assetCounts();
      await openCabin(); await activeCabin();
      const fullBefore = await capture('full-before-late-proxy');
      const cohort = await activeResources('full-before-late-proxy');
      await expect(page.locator('.cabin-window-status')).toHaveText('Loading window view…');
      await expect(page.locator('.cabin-window-status')).toBeHidden();
      await armFunctionalCapture(page, { allowUnchanged: true });
      await fault.release(); await waitForCabinWindowReady(page); await activeCabin();
      await expect(page.locator('.cabin-window-status')).toBeHidden();
      await comparePixels(fullBefore, await capture('full-after-late-proxy'), 'Late proxy does not leak through the active full cabin');
      assert.equal(assetCounts().proxy, before.proxy, 'Detailed-cabin entry does not restart the pending proxy');
      await armFunctionalCapture(page);
    await controls.getByRole('button', { name: 'Back to exterior', exact: true }).click();
      await expect(controls).toHaveCount(0);
      await releasedResources(cohort, 'Out-of-order full-cabin teardown still closes every bitmap and texture');
      await waitForCabinWindowReady(page);
      assert.equal(assetCounts().proxy, before.proxy, 'Full-cabin exit reuses the retained proxy');
      await comparePixels(exteriorBefore, await capture('late-proxy-exterior-after-back'), 'Late proxy restores the ready exterior on full-cabin exit');
    });

    await check('Proxy arrives while full cabin is in-flight and cancellation restores it', async () => {
      await switchModel('nismo'); await photoOnly();
      const proxyFault = await armFault('held-stream', proxyPath);
      await switchModel('premium'); await readyExterior({ window: false }); await pendingWindow(proxyFault);
      const fullFault = await armFault('held-stream');
      await openCabin(); await assertPartialDownload();
      const before = assetCounts();
      await proxyFault.release(); await waitForCabinWindowReady(page);
      await assertPartialDownload();
      await capture('proxy-ready-full-still-loading');
      await armFunctionalCapture(page, { allowUnchanged: true });
    await controls.getByRole('button', { name: 'Cancel cabin loading', exact: true }).click();
      await expect(controls).toHaveCount(0); await expect(cameraButton).toBeFocused();
      await releaseAborted(fullFault);
      await waitForCabinWindowReady(page);
      assert.deepEqual(assetCounts(), before, 'Opposite arrival order and cancellation do not restart either optional model');
      await comparePixels(exteriorBefore, await capture('proxy-ready-after-full-cancel'), 'Full-cabin cancellation preserves the newly ready proxy');
    });
  }

  await check('Runtime asset identity and error hygiene', async () => {
    await snapshotLoadLifecycle('before-strict-hygiene');
    assertCabinModelRequests(report.requests, baseUrl);
    await runtimeBodies.verify(report.responses, report.requestFailures);
    assert.equal(report.loadLifecycle.browser?.version, 1, 'Passive load lifecycle observer is present');
    assert.deepEqual(report.loadLifecycle.browser.issues, [], 'Browser lifecycle coverage has no gaps');
    assert.deepEqual(report.loadLifecycle.network.issues, [], 'CDP lifecycle coverage has no gaps');
    assert.deepEqual(report.loadLifecycle.issues, [], 'Lifecycle snapshot succeeds');
    assert.ok(report.loadLifecycle.correlations.every(item => item.browserFetchId !== null && item.cdpRequestId !== null), 'Each exact page request maps to its browser fetch and CDP attempt');
    const finalResources = await resourceSnapshot();
    assert.deepEqual(finalResources.issues, [], 'Resource observer has no coverage gaps');
    assert.equal(finalResources.pendingBitmapDecodes, 0);
    assert.equal(finalResources.pendingIdentities, 0);
    const candidateHashes = new Set(expectedImages.map(image => image.sha256));
    for (const bitmap of finalResources.bitmaps.filter(item => candidateHashes.has(item.sourceSha256))) assert.equal(bitmap.closeCalls, 1, 'Every completed candidate load remains closed exactly once at final hygiene');
    await writeFile(`${output}/resource-observation.json`, JSON.stringify(finalResources, null, 2));
    const missingResponses = report.responses.filter(item => item.status === 404);
    assert.equal(missingResponses.length, 2, 'Exactly one intentional full-cabin and one proxy 404');
    for (const path of [cabinPath, proxyPath]) {
      const missing = missingResponses.filter(item => item.path === path);
      assert.equal(missing.length, 1, 'Each optional model has exactly one injected 404');
      assert.equal(missing[0].injectedFault, 'missing', 'Every 404 is an armed request');
      assert.equal(missing[0].requestId, report.networkFaults.find(item => item.kind === 'missing' && item.path === path)?.requestId, 'The 404 belongs to its exact path and armed request');
    }
    correlateCabinConsole404(report.console, report.networkConsole, report.networkResponses, [baseUrl + cabinPath, baseUrl + proxyPath]);
    assert.deepEqual(report.runtimeAssetErrors, [], 'Every completed runtime asset keeps its exact identity');
    assert.deepEqual(report.pageErrors, [], 'No uncaught application errors');
    assert.deepEqual(report.console.filter(item => item.type === 'error' && !item.intentional404), [], 'No unexpected console errors');
    const unexpectedFailures = report.requestFailures.filter(item => !isExpectedCabinRequestFailure(item, report.responses));
    assert.deepEqual(unexpectedFailures, [], 'Only correlated, deliberately injected cabin faults may abort');
    assert.equal(live ? liveFaults.pending : nextFault, null, 'Every armed network fault was exercised');
    assert.deepEqual(report.console.filter(item => item.type === 'warning' && !isExpectedCabinWarning(item)), [], 'No disposal fallback or unexpected warnings');
    return { finalRequestCounts: assetCounts() };
  });
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.errors.push({ phase, message: String(error), stack: error.stack }); process.exitCode = 1;
  await snapshotLoadLifecycle('failure-before-cleanup');
  if (page && !page.isClosed()) report.functionalReadinessFailure = await page.evaluate(() => globalThis.__gtrFunctionalCapture?.snapshot()).catch(() => null);
  if (page && !page.isClosed()) report.resourceFailure = await page.evaluate(() => globalThis.__cabinResourceObserver?.snapshot()).catch(() => null);
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/${selectedViewport}-failure-page.png`, fullPage: true, timeout: 15_000 }).catch(() => {});
} finally {
  // Snapshot before teardown so diagnostic cleanup cannot impersonate an app abort.
  if (!report.loadLifecycle.browser) await snapshotLoadLifecycle('finally-before-cleanup');
  report.loadLifecycle.cleanupStartsAt = cabinLoadTime();
  loadNetwork?.stop();
  await writeFile(`${output}/load-lifecycle.json`, JSON.stringify(report.loadLifecycle, null, 2)).catch(error => {
    report.result = 'failed'; process.exitCode = 1; report.loadLifecycle.issues.push(`Timeline persistence failed: ${String(error)}`);
  });
  await liveFaults?.dispose().catch(error => { report.result = 'failed'; process.exitCode = 1; report.errors.push({ phase: 'restore-public-network', message: String(error) }); });
  for (const fault of pendingGates) fault.release();
  await observer?.evaluate(state => state.stop()).catch(() => {});
  await page?.context().tracing.stop({ path: `${output}/${selectedViewport}-trace.zip` }).catch(error => report.errors.push({ phase: 'trace', message: String(error) }));
  await browser?.close();
  server?.closeAllConnections();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  // Functions are omitted automatically; only observed network fault facts persist.
  await save();
}
console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
