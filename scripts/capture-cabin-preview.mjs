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
import {
  cabinModels, networkFaultHeader, resolveCabinTarget, verifyPublicCabinModels,
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
const [cabinModel, exteriorModel] = cabinModels;
const cabinPath = cabinModel.path, exteriorPath = exteriorModel.path;
const cabinSha256 = cabinModel.sha256, exteriorSha256 = exteriorModel.sha256;
const cabinBytes = cabinModel.bytes;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {
  commit: process.env.GITHUB_SHA, viewport: { name: selectedViewport, ...viewport }, result: 'running',
  mode: target.mode,
  scope: live ? 'Actual public Railway app after exact HTML/JS/CSS and GLB preflight. A single request-scoped 404 is intercepted; partial downloads use real public bytes under CDP throttling. No local server or application test hooks.' : 'Actual npm-built production app with exact reviewed assets. Network faults are injected only by this CI test server; no application test hooks or alternate scene.',
  renderer: 'Chromium ANGLE SwiftShader software WebGL; no physical-device FPS or performance claim',
  expectedAssets: { cabin: { path: cabinPath, sha256: cabinSha256, bytes: cabinBytes }, exterior: { path: exteriorPath, sha256: exteriorSha256 } },
  checks: [], frames: [], requests: [], responses: [], requestFailures: [], console: [], pageErrors: [], runtimeAssetErrors: [], errors: [], networkFaults: [], networkConsole: [], networkResponses: [],
  remaining: ['Physical-device performance, Safari/WebKit and Android device behavior are not measured', 'Late GPU/decoder callbacks are covered by production unit tests; browser faults specifically exercise aborted streaming responses and route teardown'],
};
await mkdir(output, { recursive: true });
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
let browser, server, page, observer, originalCanvas, liveFaults;
let nextFault = null;
let phase = 'setup';
const pendingBodies = [];
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
  if (live) {
    report.releaseAssets = await verifyReleaseAssets();
    report.publicModels = await verifyPublicCabinModels();
    await save();
  } else {
  // Delegate every ordinary request to the real production server. Only the
  // next explicitly armed cabin request gets a deterministic network fault.
  const production = createAppServer();
  const productionHandler = production.listeners('request')[0];
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path !== cabinPath || !nextFault) { void productionHandler(request, response); return; }
    const fault = nextFault; nextFault = null;
    fault.started = true;
    if (fault.kind === 'missing') {
      response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', [networkFaultHeader]: fault.kind });
      response.end('Intentional cabin-only 404 for recovery verification');
      fault.finished = true;
      return;
    }
    response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': cabin.length, 'Cache-Control': 'no-store', [networkFaultHeader]: fault.kind });
    // These are genuine model bytes, not an invented percentage. Holding the
    // remaining body makes partial byte progress and cancellation deterministic.
    response.write(cabin.subarray(0, 1_048_576));
    fault.sentBytes = 1_048_576;
    fault.release = () => {
      fault.released = true;
      fault.clientAlreadyClosed = response.destroyed;
      if (!response.destroyed) response.end(cabin.subarray(1_048_576));
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
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(45_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (live) liveFaults = createLiveCabinFaults({ page, cdp, cabinUrl: baseUrl + cabinPath, requestId, faults: report.networkFaults });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.source === 'network' && entry.level === 'error') report.networkConsole.push(entry); });
  cdp.on('Network.responseReceived', ({ requestId: id, response }) => {
    if (response.url !== baseUrl + cabinPath) return;
    report.networkResponses.push({ requestId: id, url: response.url, status: response.status, injectedFault: Object.entries(response.headers).find(([key]) => key.toLowerCase() === networkFaultHeader)?.[1] });
  });
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
    if (path.endsWith('.glb')) report.requests.push({ requestId: requestId(request), phase, path, method: request.method() });
  });
  page.on('requestfailed', request => {
    liveFaults?.onFailed(request);
    report.requestFailures.push({ requestId: requestId(request), phase, path: new URL(request.url()).pathname, failure: request.failure()?.errorText });
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (![cabinPath, exteriorPath].includes(path)) return;
    const record = { requestId: requestId(response.request()), phase, path, status: response.status(), injectedFault: response.headers()[networkFaultHeader] };
    if (live) record.injectedFault = report.networkFaults.find(fault => fault.requestId === record.requestId)?.kind;
    else if (record.injectedFault) {
      const fault = report.networkFaults.findLast(item => item.kind === record.injectedFault && item.started && item.requestId === undefined);
      assert.ok(fault, 'Marked local response belongs to an armed fault');
      fault.requestId = record.requestId;
    }
    record.url = response.url();
    assert.equal(record.url, baseUrl + path, 'Runtime model remains on the exact verification origin');
    report.responses.push(record);
    if (response.ok()) pendingBodies.push(response.body().then(bytes => {
      record.bytes = bytes.length; record.sha256 = hash(bytes);
      assert.equal(record.sha256, path === cabinPath ? cabinSha256 : exteriorSha256, 'Successful runtime asset has the exact expected identity');
      if (path === cabinPath) assert.equal(bytes.length, cabinBytes);
    }).catch(error => {
      record.bodyError = String(error);
      // An interrupted response body is expected only in the two streaming faults.
      report.runtimeAssetErrors.push(record);
    }));
  });
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
    return measurements;
  };
  const capture = async label => {
    // Verify focus at the call site first, then remove focus-visible styling
    // from overlapping production controls so the pixel proof measures the
    // restored rendering rather than keyboard-versus-pointer modality.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.mouse.move(0, 0);
    await frames();
    await page.waitForFunction(() => {
      const element = document.querySelector('.scene-stage canvas');
      return element && Math.abs(element.width / element.clientWidth - Math.min(devicePixelRatio, 1.75)) < .02;
    }, null, { timeout: 20_000 });
    const png = await canvas.screenshot({ path: `${output}/${selectedViewport}-${label}-canvas.png`, animations: 'disabled', timeout: 45_000 });
    await page.screenshot({ path: `${output}/${selectedViewport}-${label}-page.png`, fullPage: true, animations: 'disabled', scale: 'css', timeout: 45_000 });
    report.frames.push({ label, canvasSha256: hash(png), layout: await assertLayout() });
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
  const readyExterior = async () => {
    await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
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
  const armFault = async kind => {
    if (live) return liveFaults.arm(kind, phase);
    assert.equal(nextFault, null, 'One network fault at a time');
    const fault = { kind, phase };
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
      await expect(controls.getByRole('status')).toContainText('/ 14.6 MB');
    } else {
      await expect(progress).toHaveAttribute('value', '1048576');
      await expect(controls.getByRole('status')).toContainText('1.0 MB / 14.6 MB');
    }
  };
  const releaseAborted = async fault => {
    await expect.poll(() => fault.closed === true, { timeout: 5_000 }).toBe(true);
    await fault.release();
    assert.equal(fault.clientAlreadyClosed, true, 'Opt-out aborted the in-flight network stream');
    await frames();
  };

  await check('Initial exterior, WebGL and opt-in boundary', async () => {
    await page.goto(`${baseUrl}/configurator/premium`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/configurator/premium');
    await expect(page.getByRole('heading', { name: 'GT-R R35', exact: true })).toBeVisible();
    await readyExterior();
    assert.deepEqual(assetCounts(), { exterior: 1, cabin: 0 });
    report.webgl = await canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      if (!gl || gl.isContextLost()) return null;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null };
    });
    assert.ok(report.webgl, 'An actual live WebGL context exists');
    await cameraButton.click();
    await expect(page.getByRole('dialog')).toContainText('14.6 MB');
    assert.equal(assetCounts().cabin, 0, 'Opening Camera does not fetch the cabin');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await startObserver();
  });
  const exteriorBefore = await capture('exterior-before');

  await check('Delayed download cancel and stale response ignored', async () => {
    const fault = await armFault('held-stream');
    await openCabin(); await assertPartialDownload();
    await capture('loading-partial-bytes');
    await sameExterior(1);
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
      await controls.getByRole('button', { name: seat, exact: true }).click();
      await expect(controls.getByRole('button', { name: seat, exact: true })).toHaveAttribute('aria-pressed', 'true');
      seatFrames.push(hash(await capture(`seat-${seat.toLowerCase().replaceAll(' ', '-')}`)));
    }
    assert.equal(new Set(seatFrames).size, 3, 'All three actual seat views differ');
    await controls.getByRole('button', { name: 'Driver', exact: true }).click();
    const before = await capture('driver-before-look');
    await canvas.focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
    const arrow = await capture('driver-arrow-look');
    assert.notEqual(hash(arrow), hash(before), 'Arrow keys change actual rendered cabin pixels');
    await expect(controls.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (selectedViewport === 'mobile') {
      const box = await canvas.boundingBox(); assert.ok(box);
      const x = Math.round(box.x + box.width * .5), y = Math.round(box.y + box.height * .4);
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
    await controls.getByRole('button', { name: 'Back to exterior', exact: true }).click();
    await expect(controls).toHaveCount(0); await expect(cameraButton).toBeFocused();
    await sameExterior(1);
    await comparePixels(exteriorBefore, await capture('exterior-after-back'), 'Back restores exterior pixels');
    await openCabin(); await activeCabin();
    await page.getByRole('button', { name: 'Model detail', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await activeCabin();
    await page.keyboard.press('Escape');
    await expect(controls).toHaveCount(0); await expect(cameraButton).toBeFocused();
    await sameExterior(1);
    await comparePixels(exteriorBefore, await capture('exterior-after-escape'), 'Escape restores exterior pixels');
    return { requestsBeforeIntentionalRemounts: assetCounts(), canvasRemounts: 0 };
  });
  await stopObserver();

  const switchModel = async id => {
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
      assert.deepEqual(assetCounts(), before, 'No late callback restarted either asset download');
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
    await startObserver(); await openCabin(); await activeCabin(); await sameExterior(2); await stopObserver();
    await switchModel('nismo'); await photoOnly(); await watchNoResurrection();
  });
  await check('Real WebGL context loss and explicit viewer retry', async () => {
    await switchModel('premium'); await readyExterior(); await openCabin(); await activeCabin();
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
    await page.screenshot({ path: `${output}/${selectedViewport}-context-lost-page.png`, fullPage: true, animations: 'disabled', timeout: 30_000 });
    await page.getByRole('button', { name: 'Try again', exact: true }).click(); await readyExterior();
    assert.equal(assetCounts().exterior, before.exterior + 1, 'Explicit recovery downloads exactly one exterior');
    assert.equal(assetCounts().cabin, before.cabin, 'Recovery does not silently opt into the cabin');
    await capture('context-recovered-exterior');
  });

  await check('Runtime asset identity and error hygiene', async () => {
    await Promise.all(pendingBodies);
    assert.ok(report.responses.some(item => item.path === cabinPath && item.sha256 === cabinSha256), 'A successful real cabin response was inspected');
    assert.ok(report.responses.some(item => item.path === exteriorPath && item.sha256 === exteriorSha256), 'A successful real exterior response was inspected');
    const missingResponses = report.responses.filter(item => item.status === 404);
    assert.equal(missingResponses.length, 1, 'Exactly one intentional cabin 404');
    assert.equal(missingResponses[0].injectedFault, 'missing', 'The only 404 is the exact armed request');
    assert.equal(missingResponses[0].requestId, report.networkFaults.find(item => item.kind === 'missing')?.requestId, 'The 404 belongs to the missing fault');
    correlateCabinConsole404(report.console, report.networkConsole, report.networkResponses, baseUrl + cabinPath);
    assert.deepEqual(report.runtimeAssetErrors.filter(item => !isExpectedCabinBodyError(item, report.requestFailures)), [], 'Every completed runtime asset keeps its exact identity');
    assert.deepEqual(report.pageErrors, [], 'No uncaught application errors');
    assert.deepEqual(report.console.filter(item => item.type === 'error' && !item.intentional404), [], 'No unexpected console errors');
    const unexpectedFailures = report.requestFailures.filter(item => !isExpectedCabinRequestFailure(item, report.responses, cabinPath));
    assert.deepEqual(unexpectedFailures, [], 'Only correlated, deliberately injected cabin faults may abort');
    assert.equal(live ? liveFaults.pending : nextFault, null, 'Every armed network fault was exercised');
    assert.deepEqual(report.console.filter(item => item.type === 'warning' && !isExpectedCabinWarning(item)), [], 'No disposal fallback or unexpected warnings');
    return { finalRequestCounts: assetCounts() };
  });
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.errors.push({ phase, message: String(error), stack: error.stack }); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/${selectedViewport}-failure-page.png`, fullPage: true, timeout: 15_000 }).catch(() => {});
} finally {
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
