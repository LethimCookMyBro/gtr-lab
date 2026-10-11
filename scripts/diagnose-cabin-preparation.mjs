/** Exact-source staged or explicitly released public proof. Historical verdicts remain untouched. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { collectDistAssets } from './raster-cost-evidence.mjs';
import { budgets, requiredCases, models, cabinWire, cabinResourcePlan, sha256, readinessWindow, remainingBudget, resolvePreparationRequest, validatePreparationEnvironment, acceptedCabinImages, preparationOrigin, preparationReleaseMarker, validatePreparationReleaseMarker,
  assertCurrentGeometry, assertDesktopFeatureGeometry, assertResidentWorkUnchanged, assertPreparationTimeline, assertReadableControls, assertMobileContainment, assertPreparationErrorLayout, assertRestoredExteriorPose, assertCaseSourceClosure } from './cabin-preparation-policy.mjs';
import { createRuntimeBodyLedger } from './cabin-runtime-body-ledger.mjs';
import { boundedOperation, createCheckpointRecorder } from './cabin-preparation-checkpoint.mjs';
import { installCabinNetworkCapture } from './cabin-preparation-network.mjs';
import { installPreparationObserver, installPreparationDecodeFixture } from './cabin-preparation-observer.mjs';
import { buildPreparationReadiness } from './build-cabin-preparation-readiness.mjs';
import { independentExteriorTransform } from './causal-motion-preflight.mjs';
import { createCabinOracle } from './causal-cabin-model.mjs';
import { cabinResourceCohort, assertCabinResourcesReleased } from './cabin-resource-assertions.mjs';

/** Passive DOM geometry and hit-testing, sampled around the same certified screenshot. */
export function observePreparationErrorLayout() {
  const rect = element => { const r = element?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }; };
  const text = element => element?.textContent.replace(/\s+/g, ' ').trim();
  const measured = element => element && ({ ...rect(element), text: text(element), fontSize: parseFloat(getComputedStyle(element).fontSize), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight });
  const card = document.querySelector('.cabin-preparation-error'), message = card?.querySelector('p'), retry = card?.querySelector('button'), canvas = document.querySelector('.scene-stage canvas');
  const range = document.createRange(); if (message) range.selectNodeContents(message);
  const lines = message ? [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, hit: message.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })) : [];
  const paintRail = document.querySelector('.paint-rail'), paintGroup = paintRail?.querySelector('.paint-swatches');
  const groupBox = paintGroup?.getBoundingClientRect();
  const paint = { rail: rect(paintRail), group: { ...rect(paintGroup), scrollWidth: paintGroup?.scrollWidth, clientWidth: paintGroup?.clientWidth, scrollLeft: paintGroup?.scrollLeft }, overflowX: paintGroup && getComputedStyle(paintGroup).overflowX,
    labels: [...document.querySelectorAll('.paint-label > *')].map(element => { const r = document.createRange(); r.selectNodeContents(element); return { ...measured(element), lines: [...r.getClientRects()].filter(b => b.width > 0 && b.height > 0).map(b => ({ x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height })) }; }),
    controls: [...document.querySelectorAll('.paint-swatches button')].map(element => { const b = element.getBoundingClientRect(); const complete = Boolean(groupBox && b.x >= groupBox.x && b.right <= groupBox.right); return { ...rect(element), name: element.getAttribute('aria-label'), enabled: !element.disabled, complete, hit: complete && b.bottom <= innerHeight ? element.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) : null }; }) };
  const box = retry?.getBoundingClientRect();
  const hits = box ? [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9]].map(([x, y]) => retry.contains(document.elementFromPoint(box.x + box.width * x, box.y + box.height * y))) : [];
  return { width: innerWidth, height: innerHeight, documentHeight: document.documentElement.scrollHeight, scrollY, documentOverflowY: getComputedStyle(document.documentElement).overflowY, bodyOverflowY: getComputedStyle(document.body).overflowY, paint, overflow: document.documentElement.scrollWidth > innerWidth, count: document.querySelectorAll('.cabin-preparation-error').length, phase: document.querySelector('main[data-cabin-preparation]')?.getAttribute('data-cabin-preparation'), role: card?.getAttribute('role'),
    main: rect(document.querySelector('main[data-cabin-preparation]')), card: measured(card), message: { ...measured(message), lines }, retry: { ...measured(retry), enabled: Boolean(retry && !retry.disabled), hits },
    stage: rect(document.querySelector('.scene-stage')), canvas: rect(canvas), backingWidth: canvas?.width, backingHeight: canvas?.height, canvasClientWidth: canvas?.clientWidth, canvasClientHeight: canvas?.clientHeight,
    headerControls: [...document.querySelectorAll('.config-header a, .config-header button')].map(element => { const r = element.getBoundingClientRect(); return { ...rect(element), name: element.getAttribute('aria-label') || text(element), hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; }),
    blockers: [['Switch model', '.scene-bottom .switch-model'], ['Interaction hint', '.scene-bottom .interaction-hint'], ['Scene tools', '.config-toolbar']].map(([name, selector]) => ({ name, ...rect(document.querySelector(selector)) })) };
}

/** A raw same-origin transport receipt is separate from Playwright's decoded response body. */
export async function readModelRepresentation(baseUrl, encoding, mode = 'staged') {
  assert.equal(baseUrl, preparationOrigin(mode)); assert.ok(['gzip', 'identity', 'gzip;q=0'].includes(encoding));
  const { get } = await import(mode === 'live' ? 'node:https' : 'node:http');
  return new Promise((done, reject) => {
    const request = get(baseUrl + models[0].path, { headers: { 'Accept-Encoding': encoding, 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(budgets.lifecycle) }, response => {
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
  if (gzip) { assert.equal(receipt.body.length, cabinWire.bytes); assert.equal(sha256(receipt.body), cabinWire.sha256); assert.ok(receipt.body.length < decoded.length); }
  return { acceptEncoding: encoding, status: receipt.status, contentEncoding: receipt.headers['content-encoding'] ?? 'identity', vary: receipt.headers.vary,
    wireEntityBytes: receipt.body.length, wireEntitySha256: sha256(receipt.body), decodedBytes: decoded.length, decodedSha256: sha256(decoded) };
}
/** Independent pre-browser identity GETs; no response-provided URL is followed. */
export async function verifyPublicPreparationModels({ fetchImpl = fetch } = {}) {
  const verified = [], deadline = AbortSignal.timeout(120_000), origin = preparationOrigin('live');
  for (const model of models) {
    const url = origin + model.path;
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' }, signal: AbortSignal.any([deadline, AbortSignal.timeout(budgets.lifecycle)]) });
    try {
      assert.equal(response.status, 200); assert.ok(!response.redirected && (!response.url || response.url === url), 'Public model cannot redirect');
      assert.ok(['model/gltf-binary', 'application/octet-stream'].includes((response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()));
      assert.equal(response.headers.get('content-encoding') ?? 'identity', 'identity');
      const declared = response.headers.get('content-length'); assert.ok(declared === null || /^\d+$/.test(declared) && Number(declared) === model.bytes);
      assert.ok(response.body); const chunks = []; let length = 0;
      for await (const chunk of response.body) { length += chunk.byteLength; assert.ok(length <= model.bytes, 'Public model exceeds exact byte limit'); chunks.push(Buffer.from(chunk)); }
      assert.equal(length, model.bytes); assert.equal(sha256(Buffer.concat(chunks, length)), model.sha256, 'Exact reviewed public model identity');
      verified.push({ ...model, url });
    } finally { if (response.body && !response.body.locked) await response.body.cancel().catch(() => {}); }
  }
  return verified;
}
export async function main(env = process.env) {
  // This gate precedes filesystem traversal, browser/server imports and all sockets.
  const target = validatePreparationEnvironment(env);
  const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(env.R35_PREPARATION_APP_ROOT ?? '.');
  const request = JSON.parse(await readFile(resolve(harness, 'qa/cabin-preparation-request.json')));
  for (const [key, value] of Object.entries(resolvePreparationRequest(request, env))) assert.equal(env[key], value);
  const release = target.mode === 'live' ? validatePreparationReleaseMarker(JSON.parse(await readFile(resolve(root, preparationReleaseMarker))), request, env) : null;
  const source = await applicationIdentity(root), frozen = JSON.parse(await readFile(resolve(harness, 'qa/fixtures/cabin-preparation-identity.json')));
  assert.deepEqual(source, frozen); assert.equal(source.sha256, env.R35_EXPECTED_APP_TREE);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); assert.equal(commit, env.GITHUB_SHA);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '');
  if (target.mode === 'live') {
    assert.equal(root, harness, 'Live proof and release source must be the same checkout');
    assert.equal(execFileSync('git', ['-C', root, 'log', '-1', '--format=%B'], { encoding: 'utf8' }).trim(), env.R35_PREPARATION_COMMIT_MESSAGE.trim());
    const changed = execFileSync('git', ['-C', root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
    assert.ok(changed.includes(preparationReleaseMarker), 'This release commit must change its explicit marker');
    assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '', 'Public proof requires clean tracked release source');
  }
  await buildPreparationReadiness(harness);
  const assets = await collectDistAssets(resolve(root, 'dist'));
  const intendedBytes = new Map(await Promise.all([...assets.keys()].map(async path => [path, (await stat(resolve(root, 'dist' + path))).size])));
  const bodies = await Promise.all(models.map(async model => { const body = await readFile(resolve(root, 'dist' + model.path)); assert.equal(body.length, model.bytes); assert.equal(sha256(body), model.sha256); return body; }));
  const images = acceptedCabinImages(bodies[0]), transform = independentExteriorTransform(bodies[1]);
  const output = resolve(target.mode === 'live' ? 'cabin-live-results' : 'cabin-preparation-results', target.name + '-' + target.lane + (target.quality === 'reduced' ? '-reduced' : '')); await mkdir(output, { recursive: true });
  const report = { result: 'running', mode: target.mode, release, sourceCommit: commit, sourceTree: source.sha256, contract: request.contract, viewport: target.name, lane: target.lane, requestedQuality: target.quality,
    budgets, models, images, resourcePlan: cabinResourcePlan, transport: [], cases: [], errors: [],
    scope: 'Bounded functional preparation/residency proof on the actual built bundle and native-positive main completion. No historical causal/raster qualification is transferred.',
    limitations: ['SwiftShader timings describe this CI runner, not physical desktop/mobile speed.', 'DOM and native-event sampling plus bounded screenshots do not prove the absence of subframe compositor flicker.', 'Fetch/decode/native-positive-observation holds are explicit lifecycle fixtures, excluded from loading-speed claims.', 'Residency is checked for repeated entry in the same environment/quality. Environment changes can require legitimate preparation.'] };
  const save = () => writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'identity.json'), JSON.stringify({ source, commit, request, release, assets: Object.fromEntries(assets), models, images, transform }, null, 2)); await save();
  const { chromium, expect } = await import('@playwright/test');
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
    let bodyLedgerSnapshot; const checkpoint = createCheckpointRecorder({ row, save: async () => { if (bodyLedgerSnapshot) row.runtimeBodyLedger = bodyLedgerSnapshot(); await save(); } });
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, isMobile: Boolean(target.isMobile), hasTouch: Boolean(target.hasTouch), reducedMotion: 'no-preference', serviceWorkers: 'block' });
    const init = `(${installCabinResourceObserver.toString()})(${JSON.stringify({ expectedImages: images })});(${installDprMotionObserver.toString()})({maxRecords:32768,observeContextCreation:true});(${installRenderBackpressureLifecycleFixture.toString()})();(${installFunctionalCaptureObserver.toString()})();(${installPreparationObserver.toString()})(${JSON.stringify({ modelPath: models[0].path, modelJson: bodies[0].subarray(20, 20 + bodies[0].readUInt32LE(12)).toString('utf8') })});(${installPreparationDecodeFixture.toString()})(${JSON.stringify({ images })});`;
    await context.addInitScript({ content: init + (options.saveData ? 'Object.defineProperty(navigator.connection,"saveData",{configurable:true,get:()=>true});' : '') });
    const page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page);
    const requestIds = new WeakMap(), requestGenerations = new WeakMap(); let nextRequestId = 0, documentGeneration = 0, phase = name, quality = 'standard';
    const bodyLedger = createRuntimeBodyLedger({ intendedAssets: assets, intendedBytes }); bodyLedgerSnapshot = bodyLedger.snapshot;
    const pinnedPath = pathname => pathname.startsWith('/configurator/') || pathname === '/' ? '/index.html' : pathname;
    const identifyRequest = request => { if (!requestIds.has(request)) requestIds.set(request, ++nextRequestId); return requestIds.get(request); };
    page.on('request', request => {
      try {
        const id = identifyRequest(request), url = new URL(request.url());
        if (url.protocol === 'blob:' && url.origin === target.baseUrl) return;
        assert.equal(url.origin, target.baseUrl, 'Unpinned request origin');
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) bodyLedger.beginDocument(++documentGeneration);
        requestGenerations.set(request, documentGeneration);
        if (url.pathname === models[0].path) row.browserModelRequests.push({ requestId: id, url: request.url(), phase });
        else row.runtimeBodies.push(bodyLedger.issue({ requestId: id, generation: documentGeneration, url: request.url(), path: pinnedPath(url.pathname), phase, startedAt: request.timing().startTime }));
      } catch (error) { row.errors.push(String(error)); }
    });
    const modelNetwork = await installCabinNetworkCapture(cdp, row, { baseUrl: target.baseUrl, mode: target.mode, phase: () => phase });
    page.on('response', response => {
      try {
        const url = new URL(response.url()), request = response.request();
        if (url.protocol === 'blob:' && url.origin === target.baseUrl) return;
        assert.equal(url.origin, target.baseUrl, 'Unpinned response origin');
        if (url.pathname === models[0].path) { const record = row.browserModelRequests.find(r => r.requestId === identifyRequest(request)); assert.ok(record, 'Missing Playwright cabin request'); record.status = response.status(); return; }
        bodyLedger.receive({ requestId: identifyRequest(request), generation: requestGenerations.get(request), url: response.url(), status: response.status(), body: () => response.body() });
      } catch (error) { row.errors.push(String(error)); }
    });
    page.on('pageerror', error => row.pageErrors.push({ phase, message: error.message }));
    page.on('requestfailed', request => { const receipt = { phase, requestId: identifyRequest(request), path: new URL(request.url()).pathname, error: request.failure()?.errorText };
      if (receipt.path === models[0].path) { const model = row.browserModelRequests.find(r => r.requestId === receipt.requestId); if (!model) { row.errors.push('Missing failed Playwright cabin request'); return; } model.failed = receipt.error; } else { row.requestFailures.push(receipt); try { bodyLedger.fail({ requestId: receipt.requestId, generation: requestGenerations.get(request), error: receipt.error }); } catch (error) { row.errors.push(String(error)); } } });
    const tap = (locator, window = readinessWindow(15_000)) => boundedOperation(window, 'trusted input', () => target.hasTouch ? locator.tap({ timeout: remainingBudget(window) }) : locator.click({ timeout: remainingBudget(window) }));
    const snapshot = (window = readinessWindow(15_000)) => boundedOperation(window, 'preparation snapshot', () => page.evaluate(() => globalThis.__r35Preparation.snapshot()));
    const resources = async (window = readinessWindow(budgets.lifecycle)) => { await boundedOperation(window, 'resource identities', () => page.evaluate(() => globalThis.__cabinResourceObserver.settleIdentities())); return boundedOperation(window, 'resource snapshot', () => page.evaluate(() => globalThis.__cabinResourceObserver.snapshot())); };
    const fixture = (window = readinessWindow(budgets.lifecycle)) => boundedOperation(window, 'native fixture snapshot', () => page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.snapshot()));
    const mark = async label => { phase = label; row.steps.push({ label, at: Date.now() }); await page.evaluate(label => { globalThis.__r35Preparation.mark(label); globalThis.__cabinResourceObserver.mark(label); globalThis.__r35RenderBackpressureLifecycle.mark(label); globalThis.__r35DprMotion.mark(label); }, label); };
    const canvas = page.locator('.scene-stage canvas'), dialog = page.getByRole('dialog');
    const sampleDrawer = window => boundedOperation(window, 'drawer sample', () => page.evaluate(() => { const layer = document.querySelector('.drawer-layer'), drawer = document.querySelector('.drawer'), r = drawer?.getBoundingClientRect(); return { phase: drawer?.dataset.phase, bounds: r && { x: r.x, y: r.y, width: r.width, height: r.height }, animations: layer?.getAnimations({ subtree: true }).map(a => ({ state: a.playState, progress: a.effect?.getComputedTiming().progress })) ?? [] }; }));
    const open = async (label, deadline = readinessWindow(15_000)) => {
      await tap(page.getByRole('button', { name: label, exact: true }), deadline); const before = await sampleDrawer(deadline);
      await boundedOperation(deadline, 'drawer terminal animation', () => page.waitForFunction(() => { const layer = document.querySelector('.drawer-layer'), drawer = document.querySelector('.drawer'); return drawer?.dataset.phase === 'open' && layer?.getAnimations({ subtree: true }).every(a => ['finished', 'idle'].includes(a.playState)); }, null, { timeout: remainingBudget(deadline), polling: 16 }));
      const after = await sampleDrawer(deadline); remainingBudget(deadline); row.layouts.push({ label, before, after }); assert.equal(after.phase, 'open'); assert.ok(after.animations.every(a => ['finished', 'idle'].includes(a.state)));
    };
    const close = async () => { await tap(dialog.getByRole('button', { name: 'Close panel', exact: true })); await expect(dialog).toHaveCount(0, { timeout: 5_000 }); };
    const switchModel = async (id, window = readinessWindow(15_000)) => {
      await open('Switch model', window); await tap(dialog.getByRole('button', { name: id === 'premium' ? /^Premium / : /^NISMO / }), window);
      await boundedOperation(window, 'model URL acknowledgement', () => expect(page).toHaveURL(new RegExp('/configurator/' + id + '$'), { timeout: remainingBudget(window) }));
      await boundedOperation(window, 'model drawer dismissal', () => expect(dialog).toHaveCount(0, { timeout: remainingBudget(window) }));
    };
    const ready = async deadline => { const left = () => remainingBudget(deadline); await page.waitForFunction(() => globalThis.__r35Preparation?.status().ui.preparation?.phase === 'ready', null, { timeout: left(), polling: 50 }); await expect(page.locator('.scene-loading, .cabin-preparation-error, .render-error')).toHaveCount(0, { timeout: left() }); };
    const containment = () => page.evaluate(() => {
      const rect = element => { const r = element?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }; };
      const control = element => ({ ...rect(element), text: (element.getAttribute('aria-label') || element.textContent).trim(), fontSize: parseFloat(getComputedStyle(element).fontSize), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth });
      const canvas = document.querySelector('.scene-stage canvas');
      return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        header: rect(document.querySelector('.config-information-header')), headerRow: rect(document.querySelector('.config-header')), stage: rect(document.querySelector('.scene-stage')), canvas: rect(canvas), backingWidth: canvas?.width, backingHeight: canvas?.height,
        headerControls: [...document.querySelectorAll('.config-header a, .config-header button')].map(control),
        items: [...document.querySelectorAll('footer[aria-label="Cabin preview controls"] button')].map(control) };
    });
    const capture = async (label, window, mobileViewport, errorViewport) => {
      const timeout = remainingBudget(window);
      assert.ok(row.captures.length < 12, 'Bounded screenshots per case');
      await waitForFunctionalCapture(page, { preset: 'hero', timeout, quality }); remainingBudget(window);
      const screenshotStartedAt = performance.now();
      if (!row.rendererInfo) { row.rendererInfo = await canvas.evaluate(element => { const gl = element.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), nativeDpr: devicePixelRatio }; }); assert.match(row.rendererInfo.renderer, /SwiftShader/i); assert.equal(row.rendererInfo.nativeDpr, target.deviceScaleFactor); }
      const bounds = await canvas.boundingBox(); assert.ok(bounds && bounds.width > 200 && bounds.height > 150);
      const overlays = await page.evaluate(observeOverlayRectangles), rail = page.locator('footer[aria-label="Cabin preview controls"]'); if (await rail.count()) overlays.push({ name: 'cabin-rail', ...await rail.boundingBox() });
      const layoutBefore = mobileViewport && await containment();
      const errorBefore = errorViewport && await page.evaluate(observePreparationErrorLayout);
      const png = await page.screenshot({ path: resolve(output, `${name}-${label}.png`), timeout: budgets.screenshot, scale: 'css' });
      const layoutAfter = mobileViewport && await containment();
      const errorAfter = errorViewport && await page.evaluate(observePreparationErrorLayout);
      const certificate = await verifyFunctionalCapture(page); assert.ok(certificate.readyAt - certificate.armedAt <= window.budget, 'Readiness budget includes the initiating action'); assertCurrentGeometry(certificate.snapshot, quality, target.deviceScaleFactor); if (target.name === 'desktop' && target.lane === 'feature') assertDesktopFeatureGeometry(certificate.snapshot, target.quality); assert.equal(certificate.reusedUnchanged, false); assert.deepEqual(await canvas.boundingBox(), bounds);
      if (mobileViewport) { assert.deepEqual(layoutAfter, layoutBefore, 'Mobile geometry must remain unchanged across the certified screenshot'); assertMobileContainment(layoutAfter, certificate, mobileViewport); row.layouts.push({ label, value: layoutAfter, owner: certificate.owner, mainDrawId: certificate.mainDrawId, fenceId: certificate.fenceId }); }
      if (errorViewport) { row.layouts.push({ label, errorBefore, errorLayout: errorAfter, screenshotSha256: sha256(png), owner: certificate.owner, mainDrawId: certificate.mainDrawId, fenceId: certificate.fenceId }); assert.deepEqual(errorAfter, errorBefore, 'Error layout must remain unchanged across the certified screenshot'); assertPreparationErrorLayout(errorAfter, certificate, errorViewport); }
      const pixels = summarizeScenePixels(PNG.sync.read(png), bounds, overlays); assert.equal(pixels.blank, false);
      const record = { label, quality, readinessWindow: window, screenshotStartedAt, screenshotEndedAt: performance.now(), certificate, pixels, scene: canvasPixelHash(png, bounds, overlays), sha256: sha256(png) }; row.captures.push(record); await save(); return record;
    };
    const layout = async label => {
      const value = await page.locator('footer[aria-label="Cabin preview controls"]').evaluate(rail => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        items: [...rail.querySelectorAll('button')].map(button => { const r = button.getBoundingClientRect(); return { text: button.textContent.trim(), visible: button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, fontSize: parseFloat(getComputedStyle(button).fontSize), scrollWidth: button.scrollWidth, clientWidth: button.clientWidth }; }) }));
      assertReadableControls(value); row.layouts.push({ label, value });
    };
    const retire = async (owner, window = readinessWindow(budgets.lifecycle)) => {
      const before = await snapshot(window), order = before.events.filter(e => e.kind === 'attach').map(e => e.owner);
      const nativeFenceContext = (await fixture(window)).contexts.filter(c => c.sceneOwner)[order.indexOf(owner)]; assert.ok(nativeFenceContext, 'Exact retired scene-owner ordinal required');
      await expect.poll(async () => { try { assertRetiredFenceContext(await fixture(window), nativeFenceContext.id); return true; } catch { return false; } }, { timeout: remainingBudget(window) }).toBe(true);
      const observation = await snapshot(window); const native = observation.contexts.find(c => c.owner === owner); assert.ok(native && !native.connected);
      for (const resource of observation.resources.filter(r => r.contextId === native.id)) { assert.equal(resource.deleted, 1, `${resource.kind} ${resource.id} retired once`); assert.equal(resource.deletedLive, true); }
    };
    try { await action({ page, context, row, tap, snapshot, resources, fixture, mark, open, close, dialog, canvas, switchModel, ready, capture, layout, retire, checkpoint, bodyLedger, drainDocument: window => bodyLedger.drainAndSeal({ generation: documentGeneration, window }), modelNetwork, setQuality: value => { quality = value; } }); row.result = 'collected'; }
    catch (error) { row.result = 'failed'; row.errors.push(String(error)); await save(); throw error; }
    finally {
      const cleanupWindow = readinessWindow(budgets.lifecycle);
      try {
        row.observation = await checkpoint('cleanup.preparation-snapshot', cleanupWindow, () => snapshot(cleanupWindow), { cleanup: true });
        row.resources = await checkpoint('cleanup.resource-identities-and-snapshot', cleanupWindow, () => resources(cleanupWindow), { cleanup: true });
        row.fixture = await checkpoint('cleanup.native-fixture', cleanupWindow, () => fixture(cleanupWindow), { cleanup: true });
        row.dpr = await checkpoint('cleanup.dpr-snapshot', cleanupWindow, () => page.evaluate(() => globalThis.__r35DprMotion.snapshot()), { cleanup: true });
        assert.deepEqual(row.observation.issues, []); assert.deepEqual(row.resources.issues, []); assert.deepEqual(row.dpr.issues, []); assertFenceObservationHealthy(row.fixture);
        await checkpoint('cleanup.runtime-bodies', cleanupWindow, () => bodyLedger.finish({ window: cleanupWindow }), { cleanup: true });
        await checkpoint('cleanup.model-network', cleanupWindow, async () => { await boundedOperation(cleanupWindow, 'native body receipts', () => modelNetwork.settle()); await boundedOperation(cleanupWindow, 'native network close', () => modelNetwork.close()); }, { cleanup: true });
        for (const c of row.dpr.contexts.filter(c => c.sceneCanvas)) { assert.equal(c.creation.contextType, 'webgl2'); assert.equal(c.creation.requestedAntialias, true); assert.equal(c.creation.antialias, true); assert.ok(c.creation.samples >= 2 && c.creation.sampleBuffers >= 1); }
        row.sourceClosure = assertCaseSourceClosure(row, report.transport.find(r => r.acceptEncoding === 'gzip'), target.mode);
      } catch (error) { row.errors.push(String(error)); row.result = 'failed'; await save(); }
      row.runtimeBodyLedger = bodyLedger.snapshot(); row.elapsedMs = Date.now() - row.startedAt; await save();
      try {
        await checkpoint('cleanup.context-close', cleanupWindow, () => context.close(), { cleanup: true });
        row.runtimeBodyLedger = bodyLedger.snapshot(); assert.equal(row.runtimeBodyLedger.state, 'finished'); assert.deepEqual(row.runtimeBodyLedger.errors, []); assert.deepEqual(row.errors, []);
      }
      catch (error) { row.errors.push(String(error)); row.result = 'failed'; await save(); }
    }
    assert.equal(row.result, 'collected', name + ' evidence must be complete'); row.result = 'passed'; await save();
  };
  try {
    if (target.mode === 'staged') {
      const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
      server = createAppServer(resolve(root, 'dist')); await new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); });
    } else {
      const { verifyReleaseAssets } = await import('./verify-release-assets.mjs');
      report.publicAssets = await verifyReleaseAssets({ directory: resolve(root, 'dist'), commit });
      report.publicModels = await verifyPublicPreparationModels(); await save();
    }
    for (const encoding of ['gzip', 'identity', 'gzip;q=0']) report.transport.push(assertModelRepresentation(await readModelRepresentation(target.baseUrl, encoding, target.mode), encoding));
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
        if (target.name === 'desktop') {
          await open('Environment'); const radio = dialog.locator(`input[name="render-quality"][value="${target.quality}"]`);
          await tap(radio); await expect(radio).toBeChecked(); h.setQuality(target.quality); await close();
          const selected = await snapshot(); assert.equal(selected.ui.preparation.phase, 'loading'); assert.equal(selected.ui.maskOpaque, true);
          row.steps.push({ label: 'explicit-quality-before-preparation', quality: target.quality, state: selected.current, ui: selected.ui });
        }
        const masked = await snapshot(); assert.equal(masked.ui.maskCount, 1); assert.equal(masked.ui.maskOpaque, true); assert.equal(masked.ui.cabinRail, false);
        await page.screenshot({ path: resolve(output, 'initial-opaque-stage-mask.png'), timeout: budgets.screenshot, scale: 'css' });
      } finally { await hold.release(deadline); }
      await h.ready(deadline); const initial = await capture('01-initial-complete', deadline);
      row.initialPreparation = (await snapshot()).measures; assert.ok(row.initialPreparation.some(m => m.name === 'gtr-cabin-preparation-ready' && m.duration >= 0 && m.duration <= budgets.initial));
      const preparedOracle = createCabinOracle(transform); preparedOracle.reset('driver'); assertPreparationTimeline(await snapshot(), initial.certificate, { quality: target.quality, nativeDpr: target.deviceScaleFactor, driverPose: preparedOracle.expected(initial.certificate.snapshot.dimensions.renderWidth, initial.certificate.snapshot.dimensions.renderHeight).pose });
      const resourceMark = { sequence: 0 }; const cohort = cabinResourceCohort(resourceMark, await resources(), images);
      assert.equal(cohort.bitmapIds.length, cabinResourcePlan.imageCount); assert.deepEqual(cohort.decodedButNotUploaded, []); assert.deepEqual([...cohort.uploadedImageNames].sort(), images.map(image => image.name).sort()); row.residentCohort = cohort;
      const initialWork = (await snapshot()).totals; assert.equal(initialWork.fetches, 1); assert.equal(initialWork.gltfParses, 1); const owner = initial.certificate.owner;
      const enter = async (label, mobileViewport) => {
        await h.mark(label); await open('Camera'); const entryWindow = readinessWindow(budgets.functional); await armFunctionalCapture(page); await tap(dialog.getByRole('button', { name: 'Interior', exact: true })); await expect(dialog).toHaveCount(0);
        const complete = await capture(label, entryWindow, mobileViewport); const observed = await snapshot(), click = observed.clicks.findLast(c => c.label === 'Interior');
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
      assertRestoredExteriorPose(restored.certificate.snapshot.pose, initial.certificate.snapshot.pose); assert.deepEqual(restored.scene, initial.scene);
      const beforeRepeat = (await snapshot()).totals; const repeat = await enter('05-repeat-entry', target.name === 'mobile' ? target.viewport : undefined); checkSeat('driver', repeat); assertResidentWorkUnchanged(beforeRepeat, (await snapshot()).totals);
      if (target.name === 'mobile') {
        const resident = await snapshot(), residentResources = await resources();
        const residentCohort = cabinResourceCohort(resourceMark, residentResources, images); assert.deepEqual(residentCohort, cohort);
        for (const width of [320, 390]) {
          const viewport = { width, height: 844 }, resizeWindow = readinessWindow(budgets.functional);
          await armFunctionalCapture(page); await page.setViewportSize(viewport);
          const resized = await capture(width === 320 ? '06-layout-320' : '07-layout-restored-390', resizeWindow, viewport); checkSeat('driver', resized);
          assert.equal(resized.certificate.owner, owner); const observed = await snapshot();
          assert.deepEqual(observed.ui.preparation, resident.ui.preparation); assert.deepEqual(observed.contexts, resident.contexts); assert.deepEqual(observed.resources, resident.resources);
          assertResidentWorkUnchanged(resident.totals, observed.totals);
          assert.deepEqual(cabinResourceCohort(resourceMark, await resources(), images), residentCohort);
          if (width === 390) { assertRestoredExteriorPose(resized.certificate.snapshot.pose, repeat.certificate.snapshot.pose); assert.deepEqual(resized.scene, repeat.scene); }
        }
      }
      const beforeExit = await resources(); for (const id of cohort.bitmapIds) assert.equal(beforeExit.bitmaps.find(b => b.id === id).closeCalls, 0);
      await switchModel('nismo'); await expect(h.canvas).toHaveCount(0); await retire(1);
      await expect.poll(async () => { try { assertCabinResourcesReleased(cohort, await resources()); return true; } catch { return false; } }, { timeout: budgets.lifecycle }).toBe(true);
      row.resourceRetirement = assertCabinResourcesReleased(cohort, await resources());
    });
    else await runLifecycleCases({ runCase, target, output, transform, expect, armFunctionalCapture, budgets, models, assertCabinResourcesReleased, cabinResourceCohort, images });
    assert.deepEqual(report.cases.map(c => c.name), requiredCases[target.lane]); assert.ok(report.cases.every(c => c.result === 'passed')); report.result = 'passed';
  } catch (error) { report.result = 'failed'; report.errors.push({ message: String(error), stack: error.stack }); }
  finally {
    await save(); const shutdownWindow = readinessWindow(budgets.lifecycle);
    report.shutdown = { status: 'started', window: shutdownWindow }; await save();
    try { await boundedOperation(shutdownWindow, 'browser shutdown', () => browser?.close()); if (server) await boundedOperation(shutdownWindow, 'server shutdown', () => new Promise(done => server.close(done))); report.shutdown.status = 'completed'; }
    catch (error) { report.shutdown.status = 'failed'; report.shutdown.error = String(error); report.result = 'failed'; report.errors.push({ message: String(error) }); }
    await save();
  }
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
    try {
      await h.tap(h.page.getByRole('link', { name: 'Back to models', exact: true }));
      await expect(h.page).toHaveURL(/\/models$/, { timeout: remainingBudget(cancellationDeadline) });
      // The URL changes before the route's exit animation removes its resident canvas.
      await expect(h.canvas).toHaveCount(0, { timeout: remainingBudget(cancellationDeadline) });
    } finally { await hold.release(cancellationDeadline); }
    await h.retire(1);
    const cancelled = await h.snapshot(); assert.equal(cancelled.totals.fetches, 1); assert.equal(cancelled.ui.cabinRail, false);
    await armFunctionalCapture(h.page, { replacement: true }); const returnedDeadline = readinessWindow(budgets.initial);
    const premiumLink = h.page.locator('.models-page .model-bands').getByRole('link', { name: 'Explore GT-R Premium', exact: true });
    await expect(premiumLink).toHaveAttribute('href', '/configurator/premium');
    await h.tap(premiumLink); await h.ready(returnedDeadline);
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
    await h.capture('failed-interior-usable-exterior', failedDeadline, undefined, target.viewport);
    if (target.name === 'mobile') {
      const resizeWindow = readinessWindow(budgets.functional); await armFunctionalCapture(h.page); await h.page.setViewportSize({ width: 320, height: 844 });
      await h.capture('failed-interior-layout-320', resizeWindow, undefined, { width: 320, height: 844 });
      assert.equal((await h.snapshot()).totals.fetches, 1, 'Layout inspection must not trigger a model retry');
    }
    await h.open('Camera'); await expect(h.dialog.getByRole('button', { name: 'Interior', exact: true })).toBeDisabled(); await h.close();
    await armFunctionalCapture(h.page); const retryDeadline = readinessWindow(budgets.initial);
    await h.tap(h.page.getByRole('button', { name: 'Retry interior preparation', exact: true })); await h.ready(retryDeadline);
    const recovered = await h.capture('interior-retry-restored', retryDeadline);
    if (target.name === 'mobile') {
      const geometry = recovered.certificate.snapshot.dimensions;
      assert.deepEqual({ cssWidth: geometry.cssWidth, cssHeight: geometry.cssHeight, width: geometry.width, height: geometry.height }, { cssWidth: 320, cssHeight: 302, width: 480, height: 453 }, 'Successful retry restores the existing normal320 geometry');
      assert.equal(await h.page.evaluate(() => scrollY), 0); await expect(h.page.locator('.cabin-preparation-error')).toHaveCount(0);
    }
    const retried = await h.snapshot(); assert.equal(retried.totals.fetches, 2);
    const retryClick = retried.clicks.findLast(click => click.label === 'Retry interior preparation'); assert.equal(retryClick?.trusted, true); assert.equal(retryClick.ui.preparation.phase, 'error');
    assert.equal(retried.ui.preparation.phase, 'ready'); assert.equal(retried.ui.maskCount, 0);
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
    const homeWindow = readinessWindow(budgets.lifecycle);
    await h.checkpoint('savedata.home-document', homeWindow, () => h.page.goto(target.baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: remainingBudget(homeWindow) }));
    const homeBoundary = await h.checkpoint('savedata.home-boundary', homeWindow, async () => {
      await expect(h.page.getByRole('button', { name: 'Load 3D view · 8.3 MB', exact: true })).toBeVisible({ timeout: remainingBudget(homeWindow) });
      const home = await h.snapshot(homeWindow); assert.equal(home.totals.fetches, 0); assert.equal(await h.page.evaluate(() => navigator.connection.saveData), true); return home.ui;
    }); h.row.homeBoundary = homeBoundary;
    await h.checkpoint('savedata.home-body-drain', homeWindow, () => h.drainDocument(homeWindow));
    const navigationWindow = readinessWindow(budgets.lifecycle);
    await h.checkpoint('savedata.nismo-document', navigationWindow, () => { assert.deepEqual(h.bodyLedger.snapshot().errors, []); return h.page.goto(target.baseUrl + '/configurator/nismo', { waitUntil: 'domcontentloaded', timeout: remainingBudget(navigationWindow) }); });
    await h.open('Camera');
    await expect(h.dialog.getByText('Camera controls activate when this model’s licensed 3D asset is available.', { exact: true })).toBeVisible();
    await expect(h.dialog.getByRole('button', { name: 'Interior Detailed cabin required', exact: true })).toBeDisabled();
    await h.close();
    assert.equal((await h.snapshot()).totals.fetches, 0); await expect(h.canvas).toHaveCount(0);
    const deadline = readinessWindow(budgets.initial); await h.switchModel('premium'); await h.ready(deadline);
    await h.capture('explicit-premium-viewer-after-savedata-boundary', deadline);
    const observed = await h.checkpoint('savedata.postcapture-snapshot', readinessWindow(15_000), () => h.snapshot()); assert.equal(observed.totals.fetches, 1);
    const start = observed.events.find(e => e.kind === 'cabin-fetch-start'); assert.ok(start?.snapshot?.vehicle?.exterior, 'Cabin fetch may begin only after the active Premium exterior viewer exists');
    const switchWindow = readinessWindow(15_000); await h.checkpoint('savedata.final-switch-model', switchWindow, () => h.switchModel('nismo', switchWindow));
    const retirementWindow = readinessWindow(budgets.lifecycle); await h.checkpoint('savedata.retirement', retirementWindow, () => h.retire(1, retirementWindow));
  }, { saveData: true });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
