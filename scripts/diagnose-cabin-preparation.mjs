/** New staged feature contract. Historical collectors and their failure verdicts remain untouched. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { collectDistAssets } from './raster-cost-evidence.mjs';
import { budgets, requiredCases, models, sha256, readinessWindow, remainingBudget, resolvePreparationRequest, validatePreparationEnvironment, acceptedCabinImages,
  assertCurrentGeometry, assertResidentWorkUnchanged, assertPreparationTimeline, assertReadableControls, assertCaseSourceClosure } from './cabin-preparation-policy.mjs';
import { installCabinNetworkCapture } from './cabin-preparation-network.mjs';
import { installPreparationObserver, installPreparationDecodeFixture } from './cabin-preparation-observer.mjs';
import { buildPreparationReadiness } from './build-cabin-preparation-readiness.mjs';
import { independentExteriorTransform } from './causal-motion-preflight.mjs';
import { createCabinOracle } from './causal-cabin-model.mjs';
import { cabinResourceCohort, assertCabinResourcesReleased } from './cabin-resource-assertions.mjs';

/** A raw same-origin transport receipt is separate from Playwright's decoded response body. */
export async function readModelRepresentation(baseUrl, encoding) {
  assert.equal(baseUrl, 'http://127.0.0.1:4178'); assert.ok(['gzip', 'identity', 'gzip;q=0'].includes(encoding));
  const { get } = await import('node:http');
  return new Promise((done, reject) => {
    const request = get(baseUrl + models[0].path, { headers: { 'Accept-Encoding': encoding } }, response => {
      const chunks = []; let length = 0;
      response.on('data', chunk => { length += chunk.length; if (length > models[0].bytes) response.destroy(new Error('Oversized model representation')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => done({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.setTimeout(budgets.lifecycle, () => request.destroy(new Error('Model transport deadline exceeded'))); request.on('error', reject);
  });
}
export function assertModelRepresentation(receipt, encoding) {
  assert.equal(receipt.status, 200); const gzip = encoding === 'gzip';
  assert.equal(receipt.headers['content-encoding'] ?? 'identity', gzip ? 'gzip' : 'identity');
  assert.match(receipt.headers.vary ?? '', /(?:^|,\s*)Accept-Encoding(?:,|$)/i);
  assert.equal(Number(receipt.headers['content-length']), receipt.body.length);
  const decoded = gzip ? gunzipSync(receipt.body, { maxOutputLength: models[0].bytes }) : receipt.body;
  assert.equal(decoded.length, models[0].bytes); assert.equal(sha256(decoded), models[0].sha256);
  if (gzip) assert.ok(receipt.body.length < decoded.length);
  return { acceptEncoding: encoding, status: receipt.status, contentEncoding: receipt.headers['content-encoding'] ?? 'identity', vary: receipt.headers.vary,
    wireEntityBytes: receipt.body.length, wireEntitySha256: sha256(receipt.body), decodedBytes: decoded.length, decodedSha256: sha256(decoded) };
}
export async function main(env = process.env) {
  // This gate precedes filesystem traversal, browser/server imports and all sockets.
  const target = validatePreparationEnvironment(env);
  const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(env.R35_PREPARATION_APP_ROOT ?? '.');
  const request = JSON.parse(await readFile(resolve(harness, 'qa/cabin-preparation-request.json')));
  for (const [key, value] of Object.entries(resolvePreparationRequest(request, env))) assert.equal(env[key], value);
  const source = await applicationIdentity(root), frozen = JSON.parse(await readFile(resolve(harness, 'qa/fixtures/cabin-preparation-identity.json')));
  assert.deepEqual(source, frozen); assert.equal(source.sha256, env.R35_EXPECTED_APP_TREE);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); assert.equal(commit, env.GITHUB_SHA);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '');
  await buildPreparationReadiness(harness);
  const assets = await collectDistAssets(resolve(root, 'dist'));
  const bodies = await Promise.all(models.map(async model => { const body = await readFile(resolve(root, 'dist' + model.path)); assert.equal(body.length, model.bytes); assert.equal(sha256(body), model.sha256); return body; }));
  const images = acceptedCabinImages(bodies[0]), transform = independentExteriorTransform(bodies[1]);
  const output = resolve('cabin-preparation-results', target.name + '-' + target.lane); await mkdir(output, { recursive: true });
  const report = { result: 'running', sourceCommit: commit, sourceTree: source.sha256, contract: request.contract, viewport: target.name, lane: target.lane,
    budgets, models, images, transport: [], cases: [], errors: [],
    scope: 'Bounded functional preparation/residency proof on the actual built bundle and native-positive main completion. No historical causal/raster qualification is transferred.',
    limitations: ['SwiftShader timings describe this CI runner, not physical desktop/mobile speed.', 'DOM and native-event sampling plus bounded screenshots do not prove the absence of subframe compositor flicker.', 'Fetch/decode/native-positive-observation holds are explicit lifecycle fixtures, excluded from loading-speed claims.', 'Residency is checked for repeated entry in the same environment/quality. Environment changes can require legitimate preparation.'] };
  const save = () => writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'identity.json'), JSON.stringify({ source, commit, request, assets: Object.fromEntries(assets), models, images, transform }, null, 2)); await save();
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const { installFunctionalCaptureObserver, armFunctionalCapture, waitForFunctionalCapture, verifyFunctionalCapture } = await import('./cabin-preparation-readiness.generated.mjs');
  const { installCabinResourceObserver } = await import('./cabin-resource-observer.mjs');
  const { installDprMotionObserver } = await import('./dpr-motion-observer.mjs');
  const { installRenderBackpressureLifecycleFixture } = await import('./render-backpressure-lifecycle-fixture.mjs');
  const { assertFenceObservationHealthy, assertRetiredFenceContext } = await import('./diagnose-render-backpressure-lifecycle.mjs');
  const { observeOverlayRectangles, canvasPixelHash } = await import('./environment-pixel-comparison.mjs');
  const { summarizeScenePixels } = await import('./dpr-motion-policy.mjs');
  const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
  let server, browser;
  const runCase = async (name, action, options = {}) => {
    const row = { name, result: 'running', fixtures: options, startedAt: Date.now(), steps: [], captures: [], layouts: [], runtimeBodies: [], modelBodies: [], browserModelRequests: [], network: [], expectedCancellations: [], expectedFailures: [], errors: [], pageErrors: [], requestFailures: [] }; report.cases.push(row); await save();
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, isMobile: Boolean(target.isMobile), hasTouch: Boolean(target.hasTouch), reducedMotion: 'no-preference', serviceWorkers: 'block' });
    const init = `(${installCabinResourceObserver.toString()})(${JSON.stringify({ expectedImages: images })});(${installDprMotionObserver.toString()})({maxRecords:32768,observeContextCreation:true});(${installRenderBackpressureLifecycleFixture.toString()})();(${installFunctionalCaptureObserver.toString()})();(${installPreparationObserver.toString()})(${JSON.stringify({ modelPath: models[0].path, modelJson: bodies[0].subarray(20, 20 + bodies[0].readUInt32LE(12)).toString('utf8') })});(${installPreparationDecodeFixture.toString()})(${JSON.stringify({ images })});`;
    await context.addInitScript({ content: init + (options.saveData ? 'Object.defineProperty(navigator.connection,"saveData",{configurable:true,get:()=>true});' : '') });
    const page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page);
    const pendingBodies = [], requestIds = new WeakMap(); let nextRequestId = 0, phase = name, quality = 'standard';
    const identifyRequest = request => { if (!requestIds.has(request)) requestIds.set(request, ++nextRequestId); return requestIds.get(request); };
    page.on('request', request => { const id = identifyRequest(request); if (new URL(request.url()).pathname === models[0].path) row.browserModelRequests.push({ requestId: id, url: request.url(), phase }); });
    const modelNetwork = await installCabinNetworkCapture(cdp, row, { baseUrl: target.baseUrl, phase: () => phase });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.protocol === 'blob:' && url.origin === target.baseUrl) return;
      if (url.origin !== target.baseUrl) { row.errors.push('Unpinned response origin ' + response.url()); return; }
      if (url.pathname === models[0].path) { const record = row.browserModelRequests.find(r => r.requestId === identifyRequest(response.request())); if (!record) { row.errors.push('Missing Playwright cabin request'); return; } record.status = response.status(); return; }
      const path = url.pathname.startsWith('/configurator/') || url.pathname === '/' ? '/index.html' : url.pathname;
      const receipt = { phase, path, status: response.status(), requestId: identifyRequest(response.request()), startedAt: response.request().timing().startTime }; row.runtimeBodies.push(receipt);
      pendingBodies.push((async () => {
        assert.ok(assets.has(path), 'Unpinned served asset ' + path); const body = await response.body(); receipt.bytes = body.length; receipt.sha256 = sha256(body); assert.equal(response.status(), 200); assert.equal(receipt.sha256, assets.get(path));
      })().catch(error => { receipt.error = String(error); }));
    });
    page.on('pageerror', error => row.pageErrors.push({ phase, message: error.message }));
    page.on('requestfailed', request => { const receipt = { phase, requestId: identifyRequest(request), path: new URL(request.url()).pathname, error: request.failure()?.errorText };
      if (receipt.path === models[0].path) { const model = row.browserModelRequests.find(r => r.requestId === receipt.requestId); if (!model) { row.errors.push('Missing failed Playwright cabin request'); return; } model.failed = receipt.error; } else row.requestFailures.push(receipt); });
    const tap = locator => target.hasTouch ? locator.tap() : locator.click();
    const snapshot = () => page.evaluate(() => globalThis.__r35Preparation.snapshot());
    const resources = async () => { await page.evaluate(() => globalThis.__cabinResourceObserver.settleIdentities()); return page.evaluate(() => globalThis.__cabinResourceObserver.snapshot()); };
    const fixture = () => page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.snapshot());
    const mark = async label => { phase = label; row.steps.push({ label, at: Date.now() }); await page.evaluate(label => { globalThis.__r35Preparation.mark(label); globalThis.__cabinResourceObserver.mark(label); globalThis.__r35RenderBackpressureLifecycle.mark(label); globalThis.__r35DprMotion.mark(label); }, label); };
    const canvas = page.locator('.scene-stage canvas'), dialog = page.getByRole('dialog');
    const sampleDrawer = () => page.evaluate(() => { const layer = document.querySelector('.drawer-layer'), drawer = document.querySelector('.drawer'), r = drawer?.getBoundingClientRect(); return { phase: drawer?.dataset.phase, bounds: r && { x: r.x, y: r.y, width: r.width, height: r.height }, animations: layer?.getAnimations({ subtree: true }).map(a => ({ state: a.playState, progress: a.effect?.getComputedTiming().progress })) ?? [] }; });
    const open = async label => {
      const deadline = readinessWindow(15_000); await tap(page.getByRole('button', { name: label, exact: true })); const before = await sampleDrawer();
      await page.waitForFunction(() => { const layer = document.querySelector('.drawer-layer'), drawer = document.querySelector('.drawer'); return drawer?.dataset.phase === 'open' && layer?.getAnimations({ subtree: true }).every(a => ['finished', 'idle'].includes(a.playState)); }, null, { timeout: remainingBudget(deadline), polling: 16 });
      const after = await sampleDrawer(); row.layouts.push({ label, before, after }); assert.equal(after.phase, 'open'); assert.ok(after.animations.every(a => ['finished', 'idle'].includes(a.state)));
    };
    const close = async () => { await tap(dialog.getByRole('button', { name: 'Close panel', exact: true })); await expect(dialog).toHaveCount(0, { timeout: 5_000 }); };
    const switchModel = async id => { await open('Switch model'); await tap(dialog.getByRole('button', { name: id === 'premium' ? /^Premium / : /^NISMO / })); await expect(page).toHaveURL(new RegExp('/configurator/' + id + '$')); await expect(dialog).toHaveCount(0); };
    const ready = async deadline => { const left = () => remainingBudget(deadline); await page.waitForFunction(() => globalThis.__r35Preparation?.status().ui.preparation?.phase === 'ready', null, { timeout: left(), polling: 50 }); await expect(page.locator('.scene-loading, .cabin-preparation-error, .render-error')).toHaveCount(0, { timeout: left() }); };
    const capture = async (label, window) => {
      const timeout = remainingBudget(window);
      assert.ok(row.captures.length < 12, 'Bounded screenshots per case');
      await waitForFunctionalCapture(page, { preset: 'hero', timeout, quality }); remainingBudget(window);
      const screenshotStartedAt = performance.now();
      if (!row.rendererInfo) { row.rendererInfo = await canvas.evaluate(element => { const gl = element.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), nativeDpr: devicePixelRatio }; }); assert.match(row.rendererInfo.renderer, /SwiftShader/i); assert.equal(row.rendererInfo.nativeDpr, target.deviceScaleFactor); }
      const bounds = await canvas.boundingBox(); assert.ok(bounds && bounds.width > 200 && bounds.height > 150);
      const overlays = await page.evaluate(observeOverlayRectangles), rail = page.locator('footer[aria-label="Cabin preview controls"]'); if (await rail.count()) overlays.push({ name: 'cabin-rail', ...await rail.boundingBox() });
      const png = await page.screenshot({ path: resolve(output, `${name}-${label}.png`), timeout: budgets.screenshot, scale: 'css' });
      const certificate = await verifyFunctionalCapture(page); assert.ok(certificate.readyAt - certificate.armedAt <= window.budget, 'Readiness budget includes the initiating action'); assertCurrentGeometry(certificate.snapshot, quality, target.deviceScaleFactor); assert.equal(certificate.reusedUnchanged, false); assert.deepEqual(await canvas.boundingBox(), bounds);
      const pixels = summarizeScenePixels(PNG.sync.read(png), bounds, overlays); assert.equal(pixels.blank, false);
      const record = { label, quality, readinessWindow: window, screenshotStartedAt, screenshotEndedAt: performance.now(), certificate, pixels, scene: canvasPixelHash(png, bounds, overlays), sha256: sha256(png) }; row.captures.push(record); await save(); return record;
    };
    const layout = async label => {
      const value = await page.locator('footer[aria-label="Cabin preview controls"]').evaluate(rail => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        items: [...rail.querySelectorAll('button')].map(button => { const r = button.getBoundingClientRect(); return { text: button.textContent.trim(), visible: button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, fontSize: parseFloat(getComputedStyle(button).fontSize), scrollWidth: button.scrollWidth, clientWidth: button.clientWidth }; }) }));
      assertReadableControls(value); row.layouts.push({ label, value });
    };
    const retire = async owner => {
      const before = await snapshot(), order = before.events.filter(e => e.kind === 'attach').map(e => e.owner);
      const nativeFenceContext = (await fixture()).contexts.filter(c => c.sceneOwner)[order.indexOf(owner)]; assert.ok(nativeFenceContext, 'Exact retired scene-owner ordinal required');
      await expect.poll(async () => { try { assertRetiredFenceContext(await fixture(), nativeFenceContext.id); return true; } catch { return false; } }, { timeout: budgets.lifecycle }).toBe(true);
      const observation = await snapshot(); const native = observation.contexts.find(c => c.owner === owner); assert.ok(native && !native.connected);
      for (const resource of observation.resources.filter(r => r.contextId === native.id)) { assert.equal(resource.deleted, 1, `${resource.kind} ${resource.id} retired once`); assert.equal(resource.deletedLive, true); }
    };
    try { await action({ page, context, row, tap, snapshot, resources, fixture, mark, open, close, dialog, canvas, switchModel, ready, capture, layout, retire, modelNetwork, setQuality: value => { quality = value; } }); row.result = 'collected'; }
    catch (error) { row.result = 'failed'; row.errors.push(String(error)); throw error; }
    finally {
      try { row.observation = await snapshot(); row.resources = await resources(); row.fixture = await fixture(); row.dpr = await page.evaluate(() => globalThis.__r35DprMotion.snapshot()); assert.deepEqual(row.observation.issues, []); assert.deepEqual(row.resources.issues, []); assert.deepEqual(row.dpr.issues, []); assertFenceObservationHealthy(row.fixture); await Promise.all(pendingBodies); await modelNetwork.settle(); await modelNetwork.close();
        for (const c of row.dpr.contexts.filter(c => c.sceneCanvas)) { assert.equal(c.creation.contextType, 'webgl2'); assert.equal(c.creation.requestedAntialias, true); assert.equal(c.creation.antialias, true); assert.ok(c.creation.samples >= 2 && c.creation.sampleBuffers >= 1); }
        row.sourceClosure = assertCaseSourceClosure(row, report.transport.find(r => r.acceptEncoding === 'gzip'));
      } catch (error) { row.errors.push(String(error)); row.result = 'failed'; }
      row.elapsedMs = Date.now() - row.startedAt; await save(); await context.close();
    }
    assert.equal(row.result, 'collected', name + ' evidence must be complete'); row.result = 'passed'; await save();
  };
  try {
    server = createAppServer(resolve(root, 'dist')); await new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); });
    for (const encoding of ['gzip', 'identity', 'gzip;q=0']) report.transport.push(assertModelRepresentation(await readModelRepresentation(target.baseUrl, encoding), encoding));
    assert.equal(report.transport.find(r => r.acceptEncoding === 'gzip').wireEntitySha256, assets.get(models[0].path + '.gz'), 'Negotiated wire bytes must match the built gzip sidecar exactly');
    browser = await chromium.launch({ timeout: 30_000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    if (target.lane === 'feature') await runCase('direct-entry-residency', async h => {
      const { page, tap, row, open, close, dialog, snapshot, resources, capture, layout, switchModel, retire } = h;
      const hold = await h.modelNetwork.hold();
      const deadline = readinessWindow(budgets.initial);
      await page.goto(target.baseUrl + '/configurator/premium', { waitUntil: 'domcontentloaded' });
      await hold.wait(deadline);
      try {
        await open('Switch model'); await expect(dialog.getByRole('button', { name: /^NISMO / })).toBeEnabled(); await close();
        await open('Camera'); await expect(dialog.getByRole('button', { name: 'Interior', exact: true })).toBeDisabled(); await close();
        const masked = await snapshot(); assert.equal(masked.ui.maskCount, 1); assert.equal(masked.ui.maskOpaque, true); assert.equal(masked.ui.cabinRail, false);
        await page.screenshot({ path: resolve(output, 'initial-opaque-stage-mask.png'), timeout: budgets.screenshot, scale: 'css' });
      } finally { await hold.release(deadline); }
      await h.ready(deadline); const initial = await capture('01-initial-complete', deadline);
      row.initialPreparation = (await snapshot()).measures; assert.ok(row.initialPreparation.some(m => m.name === 'gtr-cabin-preparation-ready' && m.duration >= 0 && m.duration <= budgets.initial));
      const preparedOracle = createCabinOracle(transform); preparedOracle.reset('driver'); assertPreparationTimeline(await snapshot(), initial.certificate, { quality: 'standard', nativeDpr: target.deviceScaleFactor, driverPose: preparedOracle.expected(initial.certificate.snapshot.dimensions.renderWidth, initial.certificate.snapshot.dimensions.renderHeight).pose });
      const resourceMark = { sequence: 0 }; const cohort = cabinResourceCohort(resourceMark, await resources(), images); row.residentCohort = cohort;
      const initialWork = (await snapshot()).totals; assert.equal(initialWork.fetches, 1); assert.equal(initialWork.gltfParses, 1); const owner = initial.certificate.owner;
      const enter = async label => {
        await h.mark(label); await open('Camera'); const entryWindow = readinessWindow(budgets.functional); await armFunctionalCapture(page); await tap(dialog.getByRole('button', { name: 'Interior', exact: true })); await expect(dialog).toHaveCount(0);
        const complete = await capture(label, entryWindow); const observed = await snapshot(), click = observed.clicks.findLast(c => c.label === 'Interior');
        assert.ok(click?.trusted); assert.equal(complete.certificate.owner, owner); assert.ok(complete.certificate.mainDrawId > click.mainBefore);
        assert.equal(complete.certificate.snapshot.vehicle.cabinSeat, 'driver'); assert.equal(observed.ui.legacyLoading, false);
        const mark = await page.evaluate(() => performance.getEntriesByName('gtr-cabin-entry-request').at(-1)?.startTime);
        assert.ok(Number.isFinite(mark) && mark >= click.at && mark <= complete.certificate.readyAt);
        row.steps.push({ label: label + '-latency', trustedClickAt: click.at, handlerAt: mark, mainSubmittedAt: observed.events.find(e => e.kind === 'main' && e.owner === owner && e.id === complete.certificate.mainDrawId)?.at, nativeCompletedAt: observed.events.find(e => e.kind === 'wait' && e.owner === owner && e.id === complete.certificate.fenceId && [0x911a, 0x911c].includes(e.status))?.at });
        return complete;
      };
      const oracle = createCabinOracle(transform);
      const checkSeat = (seat, record) => { oracle.reset(seat); const d = record.certificate.snapshot.dimensions; assert.ok(oracle.compare(record.certificate.snapshot, d.renderWidth, d.renderHeight), 'Independent exact seat pose/projection'); };
      checkSeat('driver', await enter('02-first-entry')); assertResidentWorkUnchanged(initialWork, (await snapshot()).totals); await layout('native-viewport-controls');
      for (const [seat, label] of [['passenger', 'Passenger'], ['rear', 'Rear seat'], ['driver', 'Driver']]) {
        const seatWindow = readinessWindow(budgets.functional); await armFunctionalCapture(page); await tap(page.getByRole('button', { name: label, exact: true })); const record = await capture('03-seat-' + seat, seatWindow); checkSeat(seat, record);
      }
      const exitWindow = readinessWindow(budgets.functional); await armFunctionalCapture(page); await tap(page.getByRole('button', { name: 'Back to exterior', exact: true })); const restored = await capture('04-exterior-restored', exitWindow);
      assert.deepEqual(restored.certificate.snapshot.pose, initial.certificate.snapshot.pose); assert.deepEqual(restored.scene, initial.scene);
      const beforeRepeat = (await snapshot()).totals; checkSeat('driver', await enter('05-repeat-entry')); assertResidentWorkUnchanged(beforeRepeat, (await snapshot()).totals);
      if (target.name === 'mobile') { const resizeWindow = readinessWindow(budgets.functional); await armFunctionalCapture(page); await page.setViewportSize({ width: 320, height: 844 }); await capture('06-layout-320', resizeWindow); await layout('320px-seat-and-back'); }
      const beforeExit = await resources(); for (const id of cohort.bitmapIds) assert.equal(beforeExit.bitmaps.find(b => b.id === id).closeCalls, 0);
      await switchModel('nismo'); await expect(h.canvas).toHaveCount(0); await retire(1);
      await expect.poll(async () => { try { assertCabinResourcesReleased(cohort, await resources()); return true; } catch { return false; } }, { timeout: budgets.lifecycle }).toBe(true);
      row.resourceRetirement = assertCabinResourcesReleased(cohort, await resources());
    });
    else await runLifecycleCases({ runCase, target, output, transform, expect, armFunctionalCapture, budgets, models, assertCabinResourcesReleased, cabinResourceCohort, images });
    assert.deepEqual(report.cases.map(c => c.name), requiredCases[target.lane]); assert.ok(report.cases.every(c => c.result === 'passed')); report.result = 'passed';
  } catch (error) { report.result = 'failed'; report.errors.push({ message: String(error), stack: error.stack }); }
  finally { await save(); await browser?.close(); if (server) await new Promise(done => server.close(done)); }
  assert.equal(report.result, 'passed', 'Preparation evidence failed; inspect the preserved report'); return report;
}

async function runLifecycleCases({ runCase, target, output, transform, expect, armFunctionalCapture, budgets, models, assertCabinResourcesReleased, cabinResourceCohort, images }) {
  const holdModel = h => h.modelNetwork.hold();
  const fresh = async h => { const deadline = readinessWindow(budgets.initial); await h.page.goto(target.baseUrl + '/configurator/premium', { waitUntil: 'domcontentloaded' }); return deadline; };
  await runCase('resize-quality-during-preparation', async h => {
    const hold = await holdModel(h), deadline = await fresh(h); await hold.wait(deadline);
    try {
      await armFunctionalCapture(h.page); await h.page.setViewportSize(target.name === 'mobile' ? { width: 430, height: 900 } : { width: 1280, height: 800 });
      await h.open('Environment'); const radio = h.dialog.locator('input[name="render-quality"][value="reduced"]');
      await h.tap(radio); await expect(radio).toBeChecked(); h.setQuality('reduced'); await h.close();
      const held = await h.snapshot(); assert.equal(held.ui.preparation.phase, 'loading'); assert.equal(held.ui.maskCount, 1); assert.equal(held.ui.maskOpaque, true);
      h.row.steps.push({ label: 'resize-and-quality-committed-while-fetch-held', state: held.current, ui: held.ui });
    } finally { await hold.release(deadline); }
    await h.ready(deadline); const current = await h.capture('current-resized-reduced', deadline);
    assert.equal(current.quality, 'reduced'); const oracle = createCabinOracle(transform); oracle.reset('driver'); assertPreparationTimeline(await h.snapshot(), current.certificate, { quality: 'reduced', nativeDpr: target.deviceScaleFactor, driverPose: oracle.expected(current.certificate.snapshot.dimensions.renderWidth, current.certificate.snapshot.dimensions.renderHeight).pose });
    const observed = await h.snapshot(); const transition = observed.dom.find(d => d.ready);
    assert.deepEqual(transition.dimensions, current.certificate.snapshot.dimensions, 'The released mask must name current backing geometry, not the pre-resize/Standard stamp');
    await h.switchModel('nismo'); await h.retire(1);
  });
  await runCase('trusted-route-cancels-fetch', async h => {
    const hold = await holdModel(h), deadline = await fresh(h); await hold.wait(deadline);
    const before = await h.snapshot(); assert.equal(before.ui.preparation.phase, 'loading');
    hold.cancel('trusted Back to models cancels this held cabin request'); const cancellationDeadline = readinessWindow(budgets.lifecycle);
    try { await h.tap(h.page.getByRole('link', { name: 'Back to models', exact: true })); await expect(h.page).toHaveURL(/\/models$/); }
    finally { await hold.release(cancellationDeadline); }
    await expect(h.canvas).toHaveCount(0); await h.retire(1);
    const cancelled = await h.snapshot(); assert.equal(cancelled.totals.fetches, 1); assert.equal(cancelled.ui.cabinRail, false);
    await armFunctionalCapture(h.page, { replacement: true }); const returnedDeadline = readinessWindow(budgets.initial);
    await h.tap(h.page.locator('a[href="/configurator/premium"]').first()); await h.ready(returnedDeadline);
    const returned = await h.capture('fresh-route-return', returnedDeadline); assert.notEqual(returned.certificate.owner, before.events.find(e => e.kind === 'attach').owner);
    assert.equal((await h.snapshot()).totals.fetches, 2); await h.switchModel('nismo'); await h.retire(2);
  }, { cancel: true });
  await runCase('trusted-model-cancels-native-decode-delivery', async h => {
    await h.context.addInitScript(() => globalThis.__r35PreparationDecode.arm());
    await fresh(h);
    await h.page.waitForFunction(() => globalThis.__r35PreparationDecode.snapshot().pending === 1, null, { timeout: budgets.initial, polling: 50 });
    h.row.decodeFixtureBefore = await h.page.evaluate(() => globalThis.__r35PreparationDecode.snapshot());
    assert.ok(h.row.decodeFixtureBefore.records[0].nativeCompletedAt !== null);
    const before = await h.resources(), ids = before.bitmaps.filter(b => images.some(i => i.sha256 === b.sourceSha256)).map(b => b.id); assert.ok(ids.length > 0);
    await h.switchModel('nismo'); await expect(h.canvas).toHaveCount(0);
    await h.page.evaluate(() => globalThis.__r35PreparationDecode.release());
    await expect.poll(async () => { const r = await h.resources(); return r.pendingBitmapDecodes === 0 && ids.every(id => r.bitmaps.find(b => b.id === id)?.closeCalls === 1); }, { timeout: budgets.lifecycle }).toBe(true);
    await h.retire(1); const after = await h.snapshot(); assert.equal(after.ui.cabinRail, false); assert.ok(!after.dom.some(d => d.pathname === '/configurator/nismo' && d.ready));
    h.row.decodeFixtureAfter = await h.page.evaluate(() => globalThis.__r35PreparationDecode.snapshot());
    assert.equal(h.row.decodeFixtureAfter.records.length, 1); const held = h.row.decodeFixtureAfter.records[0];
    assert.ok(images.some(image => image.sha256 === held.sourceSha256 && image.bytes === held.sourceBytes));
    assert.equal(held.bitmapIdentity, h.row.decodeFixtureBefore.records[0].bitmapIdentity); assert.equal(held.closeCalls, 1);
    assert.ok(held.releasedAt >= held.nativeCompletedAt && held.closedAt >= held.releasedAt, 'The exact held native bitmap must close once after delivery to the cancelled owner');
    h.row.lateDecodedBitmapIds = ids;
  }, { cancel: true, decodeDeliveryHold: true });
  await runCase('trusted-model-cancels-gpu-queue', async h => {
    const hold = await holdModel(h), deadline = await fresh(h); await hold.wait(deadline);
    const nativeHold = await h.page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.armCurrent('completion-clear'));
    await hold.release(deadline);
    await h.page.waitForFunction(id => {
      const f = globalThis.__r35RenderBackpressureLifecycle.snapshot(), p = globalThis.__r35Preparation.status();
      return f.holds.find(h => h.id === id)?.substitutions > 0 && p.ui.preparation?.progressPhase === 'preparing';
    }, nativeHold.id, { timeout: remainingBudget(deadline), polling: 50 });
    const state = await h.snapshot(), f = await h.fixture();
    assert.equal(state.ui.maskOpaque, true); assert.equal(state.ui.preparation.phase, 'loading');
    assert.ok(f.fences.some(fence => fence.contextId === nativeHold.contextId && fence.deletedSequence === null), 'Native outstanding fence, not RAF demand, must own the hold');
    await h.switchModel('nismo'); await h.page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.releaseCompletion());
    await expect(h.canvas).toHaveCount(0); await h.retire(state.events.find(e => e.kind === 'attach').owner);
    const retired = await h.resources(); const candidate = retired.bitmaps.filter(b => images.some(i => i.sha256 === b.sourceSha256)); assert.ok(candidate.length > 0); assert.ok(candidate.every(b => b.closeCalls === 1));
    h.row.queueCancellation = { nativeHold, before: state.current, candidateBitmapIds: candidate.map(b => b.id) };
  }, { cancel: true, nativePositiveObservationHold: true });
  await runCase('network-failure-exterior-and-retry', async h => {
    await h.modelNetwork.failOnce();
    const failedDeadline = await fresh(h); await expect(h.page.locator('.cabin-preparation-error')).toBeVisible({ timeout: budgets.initial });
    await expect(h.page.locator('.scene-loading')).toHaveCount(0); await expect(h.page.getByRole('button', { name: 'Retry interior preparation', exact: true })).toBeEnabled();
    await h.capture('failed-interior-usable-exterior', failedDeadline);
    await h.open('Camera'); await expect(h.dialog.getByRole('button', { name: 'Interior', exact: true })).toBeDisabled(); await h.close();
    await armFunctionalCapture(h.page); const retryDeadline = readinessWindow(budgets.initial);
    await h.tap(h.page.getByRole('button', { name: 'Retry interior preparation', exact: true })); await h.ready(retryDeadline);
    await h.capture('interior-retry-restored', retryDeadline); assert.equal((await h.snapshot()).totals.fetches, 2);
    await h.switchModel('nismo'); await h.retire(1);
  }, { networkFailure: true });
  await runCase('native-viewer-retry-retires-residency', async h => {
    const deadline = await fresh(h); await h.ready(deadline); const first = await h.capture('ready-before-viewer-retry', deadline);
    const cohort = cabinResourceCohort({ sequence: 0 }, await h.resources(), images);
    const firstHold = await h.page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.armCurrent('completion-clear'));
    const nativeWindow = readinessWindow(budgets.lifecycle); await armFunctionalCapture(h.page); await h.tap(h.page.getByRole('button', { name: 'Lights', exact: true }));
    await h.page.waitForFunction(id => globalThis.__r35RenderBackpressureLifecycle.snapshot().holds.find(h => h.id === id)?.substitutions > 0, firstHold.id, { timeout: budgets.lifecycle, polling: 50 });
    await h.page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.releaseCompletion()); await h.capture('native-observation-released', nativeWindow);
    const retryHold = await h.page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.armCurrent('manual-retry'));
    await h.tap(h.page.getByRole('button', { name: 'Lights', exact: true }));
    await h.page.waitForFunction(id => globalThis.__r35RenderBackpressureLifecycle.snapshot().holds.find(h => h.id === id)?.substitutions > 0, retryHold.id, { timeout: budgets.lifecycle, polling: 50 });
    const notice = h.page.locator('.scene-notice').filter({ hasText: 'Rendering is taking longer than usual.' }); await expect(notice).toBeVisible({ timeout: 10_000 });
    await armFunctionalCapture(h.page, { replacement: true }); const retryDeadline = readinessWindow(budgets.initial);
    await h.tap(notice.getByRole('button', { name: 'Retry viewer', exact: true })); await h.ready(retryDeadline);
    const second = await h.capture('fresh-viewer-owner', retryDeadline); assert.notEqual(first.certificate.owner, second.certificate.owner); await h.retire(first.certificate.owner);
    assertCabinResourcesReleased(cohort, await h.resources()); const f = await h.fixture(); assert.equal(f.retryClicks.length, 1); assert.equal(f.retryClicks[0].trusted, true);
    await h.switchModel('nismo'); await h.retire(2);
  }, { nativePositiveObservationHold: true });
  await runCase('savedata-and-nonpremium-boundaries', async h => {
    await h.page.goto(target.baseUrl + '/', { waitUntil: 'domcontentloaded' });
    await expect(h.page.getByRole('button', { name: 'Load 3D view · 8.3 MB', exact: true })).toBeVisible({ timeout: budgets.lifecycle });
    const home = await h.snapshot(); assert.equal(home.totals.fetches, 0); assert.equal(await h.page.evaluate(() => navigator.connection.saveData), true); h.row.homeBoundary = home.ui;
    await h.page.goto(target.baseUrl + '/configurator/nismo', { waitUntil: 'domcontentloaded' });
    await h.open('Camera'); await expect(h.dialog.getByText(/Interior is unavailable/)).toBeVisible(); await h.close();
    assert.equal((await h.snapshot()).totals.fetches, 0); await expect(h.canvas).toHaveCount(0);
    const deadline = readinessWindow(budgets.initial); await h.switchModel('premium'); await h.ready(deadline);
    await h.capture('explicit-premium-viewer-after-savedata-boundary', deadline);
    const observed = await h.snapshot(); assert.equal(observed.totals.fetches, 1);
    const start = observed.events.find(e => e.kind === 'cabin-fetch-start'); assert.ok(start?.snapshot?.vehicle?.exterior, 'Cabin fetch may begin only after the active Premium exterior viewer exists');
    await h.switchModel('nismo'); await h.retire(1);
  }, { saveData: true });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
