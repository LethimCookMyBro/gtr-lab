/** Bounded CI-only feature proof. Separate from the unchanged Standard native-motion verdict. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { validateMotionEnvironment, qualityDimensions, resolveQualityRequest, motionModelsForSource, summarizeScenePixels } from './selectable-quality-policy.mjs';
import { collectDistAssets } from './raster-cost-evidence.mjs';
import { assertFenceObservationHealthy, assertRetiredFenceContext } from './diagnose-render-backpressure-lifecycle.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Adds only bounded event bookkeeping around the existing read-only production completion seam. */
export function installQualitySelectionObserver() {
  const original = globalThis.__gtrFunctionalCaptureObserver;
  if (typeof original !== 'function' || globalThis.__r35QualitySelection) throw new Error('One preinstalled completion observer required');
  const changes = [], owners = [], issues = []; let owner = null, phase = 'setup';
  const append = (list, value) => { if (list.length >= 128) { if (!issues.length) issues.push('Bounded quality observation exhausted'); } else list.push(value); };
  globalThis.__gtrFunctionalCaptureObserver = event => {
    if (event.kind === 'attach') { owner = event; append(owners, { id: event.owner, phase, at: performance.now() }); }
    if (event.kind === 'stop' && owner?.owner === event.owner) owner = null;
    original(event);
  };
  document.addEventListener('change', event => {
    if (!event.target?.matches('input[name="render-quality"]')) return;
    const snapshot = owner?.read();
    append(changes, { value: event.target.value, checked: event.target.checked, trusted: event.isTrusted, phase, at: performance.now(), owner: owner?.owner,
      pending: owner?.pending(), beforeAppliedDimensions: snapshot?.dimensions, mainBeforeAction: globalThis.__gtrFunctionalCapture.snapshot()?.lastMain?.id ?? null });
  }, true);
  globalThis.__r35QualitySelection = Object.freeze({ mark(name) { phase = name; }, snapshot() { return JSON.parse(JSON.stringify({ changes, owners, issues })); } });
}

export function assertAppliedQuality(certificate, quality, nativeDpr) {
  const state = certificate.snapshot;
  assert.equal(state.live, true); assert.equal(state.camera.settled, true);
  assert.ok([0x911a, 0x911c].includes(certificate.nativeStatus));
  assert.ok([0x911a, 0x911c].includes(certificate.drainNativeStatus));
  const expected = qualityDimensions({ ...state.dimensions, nativeDpr }, quality);
  for (const [key, value] of Object.entries(expected)) assert.equal(state.dimensions[key], value, `Actual completed ${quality} ${key}`);
  return expected;
}
export function classifyQualityResponse(rawUrl, baseUrl) {
  const url = new URL(rawUrl);
  assert.equal(url.origin, baseUrl, 'Runtime resource must belong to the exact local origin');
  if (url.protocol === 'blob:') return { kind: 'derived-blob', url: rawUrl, provenance: 'Same-origin in-memory resource; exact downloaded GLB parent bodies are verified separately. This is not an HTTP dist asset.' };
  assert.equal(url.protocol, 'http:', 'Only the closed local HTTP origin or its derived blobs are admitted');
  return { kind: 'http-asset', path: url.pathname.startsWith('/configurator/') ? '/index.html' : url.pathname };
}
export async function main(env = process.env) {
  // Gate before filesystem traversal, dynamic browser imports, server imports or sockets.
  const target = validateMotionEnvironment(env);
  const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const request = JSON.parse(await readFile(resolve(harnessRoot, 'qa/selectable-quality-request.json')));
  for (const [key, value] of Object.entries(resolveQualityRequest(request, env))) assert.equal(env[key], value);
  const root = resolve(env.R35_DPR_APP_ROOT ?? '.');
  const source = await applicationIdentity(root);
  assert.deepEqual(source, JSON.parse(await readFile(resolve(harnessRoot, 'qa/fixtures/selectable-quality-identity.json'))));
  const sourceCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(sourceCommit, env.R35_SOURCE_SHA); assert.equal(sourceCommit, env.GITHUB_SHA);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '');
  const models = motionModelsForSource(source.sha256), assets = await collectDistAssets(resolve(root, 'dist'));
  for (const model of models) { const body = await readFile(resolve(root, 'dist' + model.path)); assert.equal(body.length, model.bytes); assert.equal(hash(body), model.sha256); }
  const output = resolve('selectable-quality-results', target.name); await mkdir(output, { recursive: true });
  const report = { result: 'running', sourceCommit, sourceTree: source.sha256, contract: target.geometryContract, viewport: target.name,
    scope: 'Functional selector proof with unchanged Standard native motion in a separate CI matrix job. Chromium SwiftShader is not physical-device performance evidence.',
    limitations: ['No mobile speed or visual-benefit claim: both policies can yield identical buffers.', 'Bounded screenshots cannot rule out subframe flicker.', 'Pending/coalescing and Retry viewer use the existing explicit native-positive observation-delay fixture; this is ownership evidence, not simulated slow-GPU or smoothness evidence.'],
    steps: [], captures: [], selections: [], checkpoints: [], layouts: [], runtimeBodies: [], derivedBlobResponses: [], pageErrors: [], requestFailures: [], console: [], errors: [] };
  const save = () => writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'identity.json'), JSON.stringify({ source, sourceCommit, request, models, assets: Object.fromEntries(assets) }, null, 2)); await save();
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const { installFunctionalCaptureObserver, armFunctionalCapture, waitForFunctionalCapture, verifyFunctionalCapture } = await import('./selectable-quality-readiness.generated.mjs');
  const { installDprMotionObserver } = await import('./dpr-motion-observer.mjs');
  const { installRenderBackpressureLifecycleFixture } = await import('./render-backpressure-lifecycle-fixture.mjs');
  const { waitForCabinWindowReady } = await import('./cabin-capture-readiness.mjs');
  const { observeOverlayRectangles, canvasPixelHash } = await import('./environment-pixel-comparison.mjs');
  const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
  let server, browser, page, phase = 'setup', quality = 'standard'; const pendingBodies = [];
  const step = async (name, action) => {
    phase = name; const row = { name, result: 'running', started: Date.now() }; report.steps.push(row); await save();
    if (page?.url() !== 'about:blank' && page) await page.evaluate(name => { globalThis.__r35QualitySelection.mark(name); globalThis.__r35DprMotion.mark(name); globalThis.__r35RenderBackpressureLifecycle.mark(name); }, name);
    try { await action(); row.result = 'passed'; } catch (error) { row.result = 'failed'; row.error = String(error); throw error; }
    finally { row.elapsedMs = Date.now() - row.started; await save(); }
  };
  try {
    server = createAppServer(resolve(root, 'dist')); await new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); });
    browser = await chromium.launch({ timeout: 30_000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, isMobile: Boolean(target.isMobile), hasTouch: Boolean(target.hasTouch), reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.addInitScript({ content: `(${installDprMotionObserver.toString()})({maxRecords:32768,observeContextCreation:true});(${installRenderBackpressureLifecycleFixture.toString()})();(${installFunctionalCaptureObserver.toString()})();(${installQualitySelectionObserver.toString()})();` });
    page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    page.on('response', response => {
      let classification;
      try { classification = classifyQualityResponse(response.url(), target.baseUrl); }
      catch (error) { report.errors.push({ phase, unexpectedOrigin: response.url(), message: String(error) }); return; }
      if (classification.kind === 'derived-blob') { report.derivedBlobResponses.push({ phase, ...classification, status: response.status() }); return; }
      const { path } = classification;
      const row = { phase, path, status: response.status() }; report.runtimeBodies.push(row);
      pendingBodies.push((async () => { assert.ok(assets.has(path), `Unpinned runtime response ${path}`); const bytes = await response.body(); row.bytes = bytes.length; row.sha256 = hash(bytes); assert.equal(row.status, 200); assert.equal(row.sha256, assets.get(path)); })().catch(error => { row.error = String(error); }));
    });
    page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
    page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.console.push({ phase, type: message.type(), text: message.text() }); });
    const canvas = page.locator('.scene-stage canvas'), dialog = page.getByRole('dialog');
    const radio = value => dialog.locator(`input[name="render-quality"][value="${value}"]`);
    const fixture = () => page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.snapshot());
    const observation = () => page.evaluate(() => globalThis.__r35DprMotion.snapshot());
    const selection = () => page.evaluate(() => globalThis.__r35QualitySelection.snapshot());
    const tap = async locator => target.hasTouch ? locator.tap() : locator.click();
    const open = async () => { await tap(page.getByRole('button', { name: 'Environment', exact: true })); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('group', { name: 'Rendering quality' })).toBeVisible(); await expect(radio(quality)).toBeChecked(); };
    const close = async () => { await tap(dialog.getByRole('button', { name: 'Close panel', exact: true })); await expect(dialog).toHaveCount(0, { timeout: 5_000 }); };
    const readyExterior = async () => { await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 }); await waitForCabinWindowReady(page, { timeout: 90_000 }); await expect(canvas).toHaveCount(1); };
    const capture = async label => {
      assert.ok(report.captures.length < 16, 'Bounded feature captures');
      await waitForFunctionalCapture(page, { preset: 'hero', timeout: 90_000, quality });
      await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0, { timeout: 5_000 });
      const bounds = await canvas.boundingBox(); assert.ok(bounds && bounds.width > 200 && bounds.height > 200);
      const overlays = await page.evaluate(observeOverlayRectangles); const rail = page.locator('footer[aria-label="Cabin preview controls"]'); if (await rail.count()) overlays.push({ name: 'cabin-rail', ...await rail.boundingBox() });
      const nativeBefore = await page.evaluate(label => globalThis.__r35DprMotion.mark(label, true).dimensions, label);
      const png = await page.screenshot({ path: resolve(output, `${label}.png`), scale: 'css', timeout: 45_000 });
      const certificate = await verifyFunctionalCapture(page); const expected = assertAppliedQuality(certificate, quality, target.deviceScaleFactor);
      assert.deepEqual(await canvas.boundingBox(), bounds);
      const nativeAfter = await page.evaluate(label => globalThis.__r35DprMotion.mark(label + '-captured', true).dimensions, label);
      assert.deepEqual(nativeAfter, nativeBefore);
      for (const [key, value] of Object.entries({ width: expected.width, height: expected.height, attributeWidth: expected.width, attributeHeight: expected.height })) assert.equal(nativeAfter[key], value, 'Actual native drawing buffer ' + key);
      const pixels = summarizeScenePixels(PNG.sync.read(png), bounds, overlays); assert.equal(pixels.blank, false);
      const row = { label, phase, quality, certificate, expected, nativeBefore, nativeAfter, pixels, scene: canvasPixelHash(png, bounds, overlays), sha256: hash(png) }; report.captures.push(row); await save(); return row;
    };
    const markSetup = () => page.evaluate(() => globalThis.__r35DprMotion.mark('setup'));
    const assertSameOwner = async count => {
      const state = await fixture(); assertFenceObservationHealthy(state); const live = state.contexts.filter(c => c.sceneOwner && c.connected);
      assert.equal(state.contexts.filter(c => c.sceneOwner).length, count); assert.equal(live.length, 1); assert.equal(live[0].lostEvents, 0); assert.equal(live[0].restoredEvents, 0); return live[0].id;
    };
    const choose = async (value, keyboard = !target.hasTouch) => {
      const before = await page.evaluate(() => globalThis.__gtrFunctionalCapture.snapshot().current);
      const next = qualityDimensions({ ...before.dimensions, nativeDpr: target.deviceScaleFactor }, value);
      const unchanged = next.width === before.dimensions.width && next.height === before.dimensions.height && next.pixelRatio === before.dimensions.pixelRatio;
      const beforeChanges = (await selection()).changes.length, beforeWrites = (await observation()).events.length;
      await armFunctionalCapture(page, { allowUnchanged: unchanged });
      if (keyboard) { await radio(quality).focus(); await page.keyboard.press(value === 'reduced' ? 'ArrowRight' : 'ArrowLeft'); }
      else await radio(value).tap();
      await expect(radio(value)).toBeChecked(); quality = value;
      const changes = (await selection()).changes.slice(beforeChanges); assert.equal(changes.length, 1); assert.equal(changes[0].trusted, true); assert.equal(changes[0].value, value);
      await close(); const row = await capture(`quality-${report.captures.length}-${value}`);
      assert.equal(row.certificate.owner, changes[0].owner);
      if (!unchanged) { assert.equal(row.certificate.reusedUnchanged, false); assert.ok(row.certificate.mainDrawId > changes[0].mainBeforeAction); }
      const writes = (await observation()).events.slice(beforeWrites).filter(e => e.kind === 'canvas-write');
      if (unchanged) assert.deepEqual(writes, [], 'Identical mobile buffer policy is an intentional native no-op');
      report.selections.push({ value, trusted: changes[0], unchanged, writes, certificate: row.certificate }); return row;
    };
    let initial, restored, reduced, firstOwner;
    await step('Initial unchanged Standard and readable accessible selector', async () => {
      await page.goto(target.baseUrl + '/configurator/premium', { waitUntil: 'domcontentloaded' }); await readyExterior();
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
      report.rendererInfo = await canvas.evaluate(element => { const gl = element.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), nativeDpr: devicePixelRatio }; });
      assert.match(report.rendererInfo.renderer, /SwiftShader/i); assert.equal(report.rendererInfo.nativeDpr, target.deviceScaleFactor);
      firstOwner = await assertSameOwner(1); initial = await capture('01-default-standard');
      assert.equal(initial.expected.width, target.geometry.initial.width); assert.equal(initial.expected.height, target.geometry.initial.height);
      await open(); await expect(radio('standard')).toHaveAccessibleName(/Standard.*2 million.*default/); await expect(radio('reduced')).toHaveAccessibleName(/Reduced.*1 million/);
      await expect(dialog.locator('#render-quality-note')).toHaveText(/Small screens may look and perform the same.*Both keep anti-aliasing.*reload restores Standard/);
      const layout = await dialog.locator('.render-quality').evaluate(fieldset => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        labels: [...fieldset.querySelectorAll('label')].map(label => { const r = label.getBoundingClientRect(), text = label.querySelector('small'); return { x: r.x, right: r.right, width: r.width, height: r.height, fontSize: parseFloat(getComputedStyle(text).fontSize), scrollWidth: label.scrollWidth, clientWidth: label.clientWidth }; }) }));
      assert.equal(layout.overflow, false); for (const row of layout.labels) { assert.ok(row.x >= 0 && row.right <= layout.width && row.height >= 44 && row.fontSize >= 12); assert.ok(row.scrollWidth <= row.clientWidth); } report.layouts.push(layout);
      await page.screenshot({ path: resolve(output, '02-selector-layout.png'), timeout: 45_000, scale: 'css' });
      if (!target.hasTouch) {
        await dialog.getByRole('button', { name: 'Close panel', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(radio('standard')).toBeFocused();
        await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Close panel', exact: true })).toBeFocused();
        await page.keyboard.press('Shift+Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true); await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close panel', exact: true })).toBeFocused();
      }
      if (!target.hasTouch) { await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: 'Environment', exact: true })).toBeFocused(); await open(); }
      reduced = await choose('reduced'); await open(); restored = await choose('standard');
      assert.deepEqual(restored.certificate.snapshot.pose, initial.certificate.snapshot.pose, 'Quality round-trip restores exact pose/projection');
      assert.deepEqual(restored.scene, initial.scene, 'Standard round-trip restores exact visible RGBA and layout');
      if (target.name === 'mobile') { assert.deepEqual(reduced.expected, initial.expected); assert.deepEqual(reduced.scene, initial.scene); }
      else assert.ok(reduced.expected.width * reduced.expected.height < initial.expected.width * initial.expected.height);
      assert.equal(await assertSameOwner(1), firstOwner);
    });
    await step('Trusted rapid choices coalesce behind existing native admission', async () => {
      const hold = await page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.armCurrent('completion-clear'));
      await tap(page.getByRole('button', { name: 'Lights', exact: true }));
      await page.waitForFunction(id => globalThis.__r35RenderBackpressureLifecycle.snapshot().holds.find(h => h.id === id)?.substitutions > 0, hold.id, { timeout: 30_000, polling: 50 });
      await open(); const before = await observation(), stateBefore = await page.evaluate(() => globalThis.__gtrFunctionalCapture.snapshot().current), changesBefore = (await selection()).changes.length;
      await armFunctionalCapture(page);
      for (const value of ['reduced', 'standard', 'reduced', 'standard', 'reduced']) {
        if (target.hasTouch) await radio(value).tap(); else { await radio(quality).focus(); await page.keyboard.press(value === 'reduced' ? 'ArrowRight' : 'ArrowLeft'); }
        await expect(radio(value)).toBeChecked(); quality = value;
      }
      const held = await observation(), actions = (await selection()).changes.slice(changesBefore);
      assert.deepEqual(actions.map(a => a.value), ['reduced', 'standard', 'reduced', 'standard', 'reduced']); assert.ok(actions.every(a => a.trusted && a.pending && a.owner === initial.certificate.owner));
      assert.deepEqual(held.events.slice(before.events.length).filter(e => e.kind === 'canvas-write'), [], 'No admitted buffer writes while native observation is held');
      assert.deepEqual(await page.evaluate(() => globalThis.__gtrFunctionalCapture.snapshot().current.dimensions), stateBefore.dimensions);
      const release = await page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.releaseCompletion());
      await close(); const complete = await capture('05-coalesced-reduced');
      const writes = (await observation()).events.slice(before.events.length).filter(e => e.kind === 'canvas-write');
      const changed = complete.expected.width !== stateBefore.dimensions.width || complete.expected.height !== stateBefore.dimensions.height;
      assert.deepEqual(writes.map(w => [w.property, w.after]), changed ? [['width', complete.expected.width], ['height', complete.expected.height]] : [], 'Only final requested native dimensions commit once');
      assert.ok(writes.every(w => w.time >= release.releasedTime)); assert.equal(complete.certificate.reusedUnchanged, false);
      const done = await fixture(); assertFenceObservationHealthy(done); assert.ok(done.polls.some(p => p.sequence > release.releasedSequence && p.nativePositive && !p.substituted));
      report.checkpoints.push({ label: 'coalescing', actions, release, writes, completed: complete.certificate, fixture: done }); assert.equal(await assertSameOwner(1), firstOwner);
      await armFunctionalCapture(page); await tap(page.getByRole('button', { name: 'Lights', exact: true })); await capture('05b-coalesced-reduced-lights-off');
    });
    await step('Cabin choices retain scene ownership and reverse pixels', async () => {
      await armFunctionalCapture(page); await tap(page.getByRole('button', { name: 'Camera', exact: true }));
      await tap(dialog.getByRole('button', { name: 'Cabin preview · work in progress', exact: true }));
      const rail = page.locator('footer[aria-label="Cabin preview controls"]'); await expect(rail.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 90_000 }); await expect(dialog).toHaveCount(0);
      await capture('06-cabin-reduced'); await open(); const standard = await choose('standard'); await open(); await choose('reduced'); await open(); const final = await choose('standard');
      assert.deepEqual(final.certificate.snapshot.pose, standard.certificate.snapshot.pose); assert.deepEqual(final.scene, standard.scene); assert.equal(await assertSameOwner(1), firstOwner);
      await open(); await choose('reduced');
    });
    await step('Trusted Retry viewer retains Reduced on exactly one fresh owner', async () => {
      const hold = await page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle.armCurrent('manual-retry'));
      await canvas.focus(); await canvas.press('ArrowRight');
      await page.waitForFunction(id => globalThis.__r35RenderBackpressureLifecycle.snapshot().holds.find(h => h.id === id)?.substitutions > 0, hold.id, { timeout: 30_000, polling: 50 });
      const notice = page.locator('.scene-notice').filter({ hasText: 'Rendering is taking longer than usual.' }); await expect(notice).toBeVisible({ timeout: 10_000 });
      await armFunctionalCapture(page, { replacement: true }); await markSetup(); await tap(notice.getByRole('button', { name: 'Retry viewer', exact: true })); await readyExterior();
      const replacement = await capture('12-retry-reduced'); assert.notEqual(replacement.certificate.owner, initial.certificate.owner);
      await expect.poll(async () => { try { assertRetiredFenceContext(await fixture(), firstOwner); return true; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
      await open(); await expect(radio('reduced')).toBeChecked(); await close();
      const done = await fixture(); assert.equal(done.retryClicks.length, 1); assert.equal(done.retryClicks[0].trusted, true); await assertSameOwner(2); report.checkpoints.push({ label: 'retry', fixture: done });
    });
    await step('In-session route return retains Reduced and completed native pixels', async () => {
      const before = await assertSameOwner(2);
      const switchModel = async (id, name) => { await tap(page.getByRole('button', { name: 'Switch model', exact: true })); await tap(dialog.getByRole('button', { name })); await expect(page).toHaveURL(new RegExp(`/configurator/${id}$`)); await expect(dialog).toHaveCount(0); };
      await switchModel('nismo', /^NISMO /); await expect(canvas).toHaveCount(0); await open(); await expect(radio('reduced')).toBeChecked(); await expect(radio('standard')).toBeDisabled(); await close();
      await armFunctionalCapture(page, { replacement: true }); await markSetup(); await switchModel('premium', /^Premium /); await readyExterior(); const returned = await capture('13-route-return-reduced');
      await expect.poll(async () => { try { assertRetiredFenceContext(await fixture(), before); return true; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
      await open(); await expect(radio('reduced')).toBeChecked(); await close(); await assertSameOwner(3);
      const retry = report.captures.find(row => row.label === '12-retry-reduced'); assert.deepEqual(returned.scene, retry.scene); assert.deepEqual(returned.certificate.snapshot.pose, retry.certificate.snapshot.pose);
    });
    report.result = 'collected';
  } catch (error) { report.result = 'failed'; report.errors.push({ phase, message: String(error), stack: error.stack }); }
  finally {
    if (page) try {
      report.observation = await page.evaluate(() => globalThis.__r35DprMotion?.snapshot()); report.selection = await page.evaluate(() => globalThis.__r35QualitySelection?.snapshot()); report.fixture = await page.evaluate(() => globalThis.__r35RenderBackpressureLifecycle?.snapshot());
      assert.deepEqual(report.observation?.issues, []); assert.deepEqual(report.selection?.issues, []); assertFenceObservationHealthy(report.fixture);
      for (const c of report.observation.contexts.filter(c => c.sceneCanvas)) { assert.equal(c.creation.contextType, 'webgl2'); assert.equal(c.creation.requestedAntialias, true); assert.equal(c.creation.antialias, true); assert.ok(c.creation.samples >= 2 && c.creation.sampleBuffers >= 1); }
      await Promise.all(pendingBodies); assert.equal(report.runtimeBodies.some(r => r.error || !r.sha256), false);
      for (const model of models) assert.ok(report.runtimeBodies.some(r => r.path === model.path && r.sha256 === model.sha256 && r.bytes === model.bytes));
      assert.ok(report.runtimeBodies.some(r => r.path === '/index.html')); assert.ok(report.runtimeBodies.some(r => r.path.endsWith('.js')));
      assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.requestFailures, []); assert.deepEqual(report.console.filter(r => r.type === 'error'), []); assert.deepEqual(report.errors, []);
      if (report.result === 'collected') report.result = 'passed';
    } catch (error) { report.result = 'failed'; report.errors.push({ phase: 'final evidence', message: String(error) }); }
    await save();
    try { await browser?.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); } report.cleanupConfirmed = true; }
    catch (error) { report.result = 'failed'; report.errors.push({ phase: 'cleanup', message: String(error) }); }
    await save();
  }
  console.log(JSON.stringify({ result: report.result, sourceCommit, sourceTree: source.sha256, output, errors: report.errors }, null, 2));
  if (report.result !== 'passed') process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
