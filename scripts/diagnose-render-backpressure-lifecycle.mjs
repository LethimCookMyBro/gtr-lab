/** Separate CI-only production ownership proof; never substitutes for normal-motion evidence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { validateMotionEnvironment, resolveMotionRequest, motionModelsForSource, summarizeScenePixels } from './dpr-motion-policy.mjs';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { installRenderBackpressureLifecycleFixture } from './render-backpressure-lifecycle-fixture.mjs';

const contracts = Object.freeze(['render-backpressure-2m-msaa-v1', 'render-repair-readiness-2m-msaa-v1']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateBackpressureLifecycleEnvironment(env, request) {
  const target = validateMotionEnvironment(env);
  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Lifecycle proof requires reviewed main push');
  for (const marker of ['[stage-dpr-motion]', '[stage-cabin-integration]']) assert.ok((env.R35_DPR_COMMIT_MESSAGE ?? '').includes(marker), `Lifecycle proof requires ${marker}`);
  assert.ok(contracts.includes(target.geometryContract), 'Lifecycle proof requires an exact reviewed render-backpressure or repair contract');
  assert.equal(request.geometryContract, target.geometryContract, 'Lifecycle request must match its exact reviewed contract');
  assert.equal(request.version, 2); assert.equal(request.mode, 'fixed');
  const resolved = resolveMotionRequest(request, env);
  for (const [key, value] of Object.entries(resolved)) assert.equal(env[key], value, `Lifecycle environment differs from exact reviewed request: ${key}`);
  assert.equal(target.geometry.sourceTree, request.sourceTree);
  return target;
}
export function assertFenceObservationHealthy(snapshot) {
  assert.deepEqual(snapshot.issues, [], 'Fixture coverage is complete');
  assert.equal(snapshot.events.some(e => ['native-exception', 'null-fence'].includes(e.kind)), false, 'Native fence errors are never masked');
  for (const fence of snapshot.fences) {
    assert.equal(fence.pollsAfterDelete, 0, `Deleted admission/disposal fence ${fence.id} is never polled again`);
    assert.ok(fence.deleteCalls <= 1, `Fence ${fence.id} is deleted at most once`);
  }
  for (const poll of snapshot.polls) {
    assert.ok(poll.flags === 0 && poll.timeout === 0, 'Only existing nonblocking native polls are observed');
    if (poll.substituted) {
      assert.equal(poll.nativePositive, true); assert.equal(poll.contextLost, false);
      assert.equal(poll.contextId, snapshot.firstSceneContextId);
      assert.equal(poll.returnedResult, 0x911b, 'Only TIMEOUT_EXPIRED is injected');
    } else assert.equal(poll.returnedResult, poll.nativeResult, 'Unarmed and failure results pass through unchanged');
    assert.notEqual(poll.nativeResult, 0x911d, 'Actual WAIT_FAILED must fail the scenario');
  }
}
export function assertRetiredFenceContext(snapshot, id) {
  assertFenceObservationHealthy(snapshot);
  const context = snapshot.contexts.find(c => c.id === id);
  assert.ok(context?.sceneOwner); assert.equal(context.connected, false, 'Retired canvas is detached');
  assert.equal(context.lostEvents, 1, 'Native production disposal retires the old context');
  assert.equal(context.restoredEvents, 0, 'Old context is never restored');
  const fences = snapshot.fences.filter(f => f.contextId === id);
  assert.ok(fences.length > 0, 'Retired owner has real native fence evidence');
  for (const fence of fences) {
    assert.equal(fence.deleteCalls, 1, `Retired owner fence ${fence.id} is deleted exactly once`);
    assert.ok(fence.deletedSequence < context.lostSequence, 'Fences retire before native context loss');
    assert.equal(fence.deletedWhileLive, true, 'Fences are deleted in a live context');
  }
  assert.equal(snapshot.polls.some(p => p.contextId === id && p.sequence > context.lostSequence), false, 'No stale old-owner sync polling after native disposal');
  return { contextId: id, fenceIds: fences.map(f => f.id), lostSequence: context.lostSequence };
}

/** A new owner may truthfully show feedback while its own native work is pending. */
export function assessReplacementNotices(snapshot, { afterSequence, retiredContextId, activeContextId }) {
  assertFenceObservationHealthy(snapshot);
  assert.notEqual(activeContextId, retiredContextId, 'Replacement status must use a fresh context generation');
  const owner = snapshot.contexts.find(c => c.id === activeContextId);
  assert.ok(owner?.sceneOwner, 'Replacement has an observed native scene owner');
  assert.equal(owner.connected, true, 'Replacement remains mounted during status completion proof');
  assert.equal(owner.lostEvents, 0); assert.equal(owner.restoredEvents, 0);
  let checked = 0, awaitingCompletion = 0, awaitingClear = 0;
  for (const notice of snapshot.notices.filter(n => n.pending && n.sequence > afterSequence)) {
    checked++;
    assert.deepEqual(notice.connectedContextIds, [activeContextId], 'Pending status belongs only to the live replacement, never the retired owner');
    assert.equal(notice.count, 1); assert.equal(notice.role, 'status');
    assert.ok(owner.sequence < notice.sequence && (owner.lostSequence === null || owner.lostSequence > notice.sequence), 'Notice belongs to a live context generation');
    const pending = snapshot.fences.filter(f => f.contextId === activeContextId && f.sequence < notice.sequence &&
      (f.deletedSequence === null || f.deletedSequence > notice.sequence)).filter(f => {
      const last = snapshot.polls.findLast(p => p.fenceId === f.id && p.sequence < notice.sequence);
      return last?.contextId === activeContextId && last.nativeResult === 0x911b && last.returnedResult === 0x911b &&
        !last.nativePositive && !last.contextLost && !last.substituted && notice.time - f.pendingPrefixTime >= 5_000;
    });
    assert.ok(pending.length, 'A replacement notice requires its own live, native-pending fence and five-second prefix');
    const clear = snapshot.notices.find(n => !n.pending && n.sequence > notice.sequence);
    const completion = snapshot.polls.find(p => p.contextId === activeContextId && p.sequence > notice.sequence &&
      (!clear || p.sequence < clear.sequence) && [0x911a, 0x911c].includes(p.nativeResult) && p.nativePositive && !p.substituted && !p.contextLost &&
      snapshot.fences.some(f => f.id === p.fenceId && f.contextId === activeContextId && f.sequence < p.sequence &&
        (f.deletedSequence === null || f.deletedSequence > p.sequence) && pending.some(prior => prior.pendingPrefixTime === f.pendingPrefixTime)));
    if (clear) {
      assert.deepEqual(clear.connectedContextIds, [activeContextId], 'Completion clears status without replacing or retiring its owner');
      assert.ok(completion, 'Replacement notice clears only after its own real native completion');
      assert.ok(clear.time >= completion.time && clear.time - completion.time <= 5_000, 'Completion clears the notice within the existing five-second UI bound');
    } else if (completion) awaitingClear++;
    else awaitingCompletion++;
  }
  return { checked, awaitingCompletion, awaitingClear };
}

export async function main(env = process.env) {
  // First operation: no file lookup, dynamic browser/server import or socket before the CI gate.
  validateMotionEnvironment(env);
  const harness = dirname(fileURLToPath(import.meta.url));
  const request = JSON.parse(await readFile(resolve(harness, '../qa/dpr-motion-request.json'), 'utf8'));
  const target = validateBackpressureLifecycleEnvironment(env, request);
  const root = resolve(env.R35_DPR_APP_ROOT ?? '.');
  const source = await applicationIdentity(root);
  assert.equal(source.sha256, env.R35_EXPECTED_APP_TREE, 'Built candidate source differs from reviewed identity');
  const sourceCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(sourceCommit, env.R35_SOURCE_SHA, 'Candidate checkout is not the exact approved source commit');
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '', 'Candidate production source must be clean');
  const models = motionModelsForSource(source.sha256);
  assert.deepEqual(models[1], { path: '/models/ciasny-r35.glb', bytes: 8_296_356, sha256: 'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d' }, 'Lifecycle proof keeps the original exterior body');
  for (const model of models) {
    const bytes = await readFile(resolve(root, 'dist' + model.path));
    assert.equal(bytes.length, model.bytes); assert.equal(hash(bytes), model.sha256, `Exact built model: ${model.path}`);
  }
  const imageManifest = JSON.parse(await readFile(resolve(harness, '../qa/cabin-preview/realism-images.json'), 'utf8'));
  assert.equal(imageManifest.assetSha256, models[0].sha256); assert.equal(imageManifest.assetBytes, models[0].bytes);
  const expectedImages = imageManifest.images;
  const bundles = new Map([['/index.html', hash(await readFile(resolve(root, 'dist/index.html')))]]);
  for (const name of await readdir(resolve(root, 'dist/assets'))) if (/\.(?:js|css)$/.test(name)) bundles.set(`/assets/${name}`, hash(await readFile(resolve(root, 'dist/assets', name))));
  const output = resolve(`render-backpressure-lifecycle-results/${target.name}`); await mkdir(output, { recursive: true });
  const report = { result: 'running', sourceCommit, harnessCommit: env.GITHUB_SHA, sourceTree: source.sha256, geometryContract: target.geometryContract, viewport: target.name,
    scope: 'Actual production app with CI-only positive-fence-observation delay on its first current WebGL2 context. This injected ownership/notice/retry lane is separate from unchanged normal-motion acceptance.',
    renderer: 'Chromium ANGLE SwiftShader software WebGL only', reducedMotion: 'no-preference',
    limitations: ['This does not simulate an actually slow GPU or establish motion, physical-device FPS, performance or flicker improvements.', 'A scalar DOM transition trace plus native fence/resource lifecycles proves the observed generations; callbacks inside React are not intercepted.'],
    steps: [], captures: [], screenshotRetries: [], resourceEvidence: [], checkpoints: [], runtimeBodies: [], runtimeBundleBodies: [], requestFailures: [], pageErrors: [], console: [], errors: [] };
  await writeFile(`${output}/identity.json`, JSON.stringify({ sourceCommit, source, models, bundles: Object.fromEntries(bundles), request }, null, 2));
  const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await save();
  // These imports are intentionally below both the exact source gate and built-body preflight.
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const { installCabinResourceObserver } = await import('./cabin-resource-observer.mjs');
  const { cabinResourceCohort, assertCabinResourcesReleased } = await import('./cabin-resource-assertions.mjs');
  const { waitForCabinWindowReady } = await import('./cabin-capture-readiness.mjs');
  const { observeOverlayRectangles } = await import('./environment-pixel-comparison.mjs');
  const { captureWithTimeoutRetry } = await import('./diagnose-configurator-controls.mjs');
  const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
  let server, browser, page, context, phase = 'setup'; const pendingBodies = [];
  const step = async (name, action) => {
    phase = name;
    if (page && page.url() !== 'about:blank') await page.evaluate(name => { window.__r35RenderBackpressureLifecycle.mark(name); window.__cabinResourceObserver.mark(name); }, name);
    const entry = { name, result: 'running', started: Date.now() }; report.steps.push(entry); await save();
    try { await action(); entry.result = 'passed'; } catch (error) { entry.result = 'failed'; entry.error = String(error); throw error; }
    finally { entry.elapsedMs = Date.now() - entry.started; await save(); }
  };
  try {
    server = createAppServer(resolve(root, 'dist'));
    await new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); });
    browser = await chromium.launch({ timeout: 30_000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, isMobile: Boolean(target.isMobile), hasTouch: Boolean(target.hasTouch), reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.addInitScript({ content: `(${installCabinResourceObserver.toString()})(${JSON.stringify({ expectedImages, maxFrames: 8192 })});(${installRenderBackpressureLifecycleFixture.toString()})();` });
    page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page); const requests = new Map();
    await cdp.send('Network.enable', { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 256 * 1024 * 1024 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      const path = new URL(response.url).pathname; if (!models.some(m => m.path === path)) return;
      const record = { requestId, path, url: response.url, status: response.status, phase }; requests.set(requestId, record); report.runtimeBodies.push(record);
    });
    cdp.on('Network.loadingFinished', ({ requestId }) => {
      const record = requests.get(requestId); if (!record) return;
      pendingBodies.push((async () => {
        const expected = models.find(m => m.path === record.path), body = await cdp.send('Network.getResponseBody', { requestId });
        const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'); record.sha256 = hash(bytes); record.bytes = bytes.length;
        assert.equal(record.url, target.baseUrl + record.path); assert.equal(record.status, 200); assert.equal(record.bytes, expected.bytes); assert.equal(record.sha256, expected.sha256);
      })().catch(error => { record.error = String(error); }));
    });
    page.on('response', response => {
      const url = new URL(response.url()), path = url.pathname === '/configurator/premium' ? '/index.html' : url.pathname;
      if (!bundles.has(path)) return;
      const record = { path, url: response.url(), phase, status: response.status() }; report.runtimeBundleBodies.push(record);
      pendingBodies.push((async () => { record.sha256 = hash(await response.body()); assert.equal(url.origin, target.baseUrl); assert.equal(record.status, 200); assert.equal(record.sha256, bundles.get(path)); })().catch(error => { record.error = String(error); }));
    });
    page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.console.push({ phase, type: message.type(), text: message.text() }); });
    page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    const canvas = page.locator('.scene-stage canvas'), rail = page.locator('footer[aria-label="Cabin preview controls"]');
    const notice = page.locator('.scene-notice').filter({ hasText: 'Rendering is taking longer than usual.' });
    const fixture = () => page.evaluate(() => window.__r35RenderBackpressureLifecycle.snapshot());
    const resources = () => page.evaluate(() => window.__cabinResourceObserver.snapshot());
    const checkpoint = async label => { const state = await fixture(); assertFenceObservationHealthy(state); report.checkpoints.push({ label, state }); return state; };
    const counts = () => models.map(model => report.runtimeBodies.filter(r => r.path === model.path).length);
    const settleResources = async () => {
      let snapshot;
      await expect.poll(async () => { snapshot = await resources(); return snapshot.pendingBitmapDecodes === 0 && snapshot.pendingIdentities === 0; }, { timeout: 5_000 }).toBe(true);
      assert.deepEqual(snapshot.issues, []); assert.equal(snapshot.requestedBitmaps, snapshot.bitmaps.length + snapshot.rejectedBitmaps, 'Every requested decode has settled');
      return snapshot;
    };
    const readyExterior = async () => {
      await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
      await waitForCabinWindowReady(page, { timeout: 90_000 });
      await expect(page.locator('.cabin-window-status')).toBeVisible({ timeout: 5_000 });
      await expect(canvas).toHaveCount(1, { timeout: 5_000 });
      await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0, { timeout: 5_000 });
      await expect(rail).toHaveCount(0, { timeout: 5_000 });
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
    };
    const capture = async label => {
      const bounds = await canvas.boundingBox(); assert.ok(bounds && bounds.width > 200 && bounds.height > 200);
      const overlays = await page.evaluate(observeOverlayRectangles); if (await rail.count()) overlays.push({ name: 'cabin-rail', ...await rail.boundingBox() });
      const file = `${output}/${label}.png`;
      const png = await captureWithTimeoutRetry(() => page.screenshot({ path: file, timeout: 45_000, scale: 'css' }), async error => { report.screenshotRetries.push({ label, reason: error.message, timeoutMs: 45_000, maxAttempts: 2 }); await save(); });
      assert.deepEqual(await canvas.boundingBox(), bounds);
      const pixels = summarizeScenePixels(PNG.sync.read(png), bounds, overlays); assert.equal(pixels.blank, false, 'Native lifecycle capture contains a rendered scene');
      report.captures.push({ label, file: `${label}.png`, sha256: hash(png), ...pixels });
    };
    const openCabin = async () => {
      const mark = await page.evaluate(() => window.__cabinResourceObserver.mark('cabin-attempt'));
      await page.getByRole('button', { name: 'Camera', exact: true }).click({ timeout: 15_000 });
      await page.getByRole('dialog').getByRole('button', { name: 'Cabin preview · work in progress', exact: true }).click({ timeout: 15_000 });
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
      await expect(rail.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 90_000 });
      await expect(canvas).toHaveAttribute('aria-label', /fixed seat/, { timeout: 5_000 });
      return mark;
    };
    const cohort = async (mark, label) => {
      const snapshot = await settleResources(), owned = cabinResourceCohort(mark, snapshot, expectedImages);
      assert.equal(owned.contextIds.length, 1); assert.ok(snapshot.frames.some(f => f.contextId === owned.contextIds[0] && f.calls > 0 && f.triangles > 0), 'Cabin owner submitted real geometry');
      report.resourceEvidence.push({ label, cohort: owned, snapshot }); return owned;
    };
    const released = async (owned, label) => {
      let snapshot, details;
      await expect.poll(async () => { snapshot = await resources(); try { details = assertCabinResourcesReleased(owned, snapshot); return true; } catch (error) { return String(error); } }, { timeout: 5_000 }).toBe(true);
      report.resourceEvidence.push({ label, details, snapshot });
    };
    const waitRetired = async id => {
      // Observe the existing production asyncRendererDisposal drain contract.
      // Detachment/UI and texture/bitmap assertions keep their separate 5s bounds.
      let state, retired;
      await expect.poll(async () => { state = await fixture(); try { retired = assertRetiredFenceContext(state, id); return true; } catch (error) { return String(error); } }, { timeout: 30_000 }).toBe(true);
      return retired;
    };
    const armAndShowNotice = async label => {
      const hold = await page.evaluate(label => window.__r35RenderBackpressureLifecycle.armCurrent(label), label);
      await canvas.focus(); await canvas.press('ArrowRight', { timeout: 15_000 });
      // Native clean-frame completion can exceed 5s in SwiftShader (observed 3.5–6.7s).
      // Match the existing clean-key completion gate's bounded 30s budget only
      // for observing a genuine positive fence result; all UI/input bounds stay unchanged.
      await page.waitForFunction(id => window.__r35RenderBackpressureLifecycle.snapshot().holds.find(h => h.id === id)?.substitutions > 0, hold.id, { timeout: 30_000, polling: 50 });
      // Production's feedback threshold is 5s, followed by the original 5s UI assertion bound.
      await page.waitForTimeout(5_000);
      await expect(notice).toBeVisible({ timeout: 5_000 }); await expect(notice).toHaveAttribute('role', 'status', { timeout: 5_000 });
      await expect(notice.getByRole('button', { name: 'Retry viewer', exact: true })).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.render-error')).toHaveCount(0, { timeout: 5_000 });
      const state = await checkpoint(label + '-pending'), current = state.holds.find(h => h.id === hold.id);
      const firstNotice = state.notices.find(n => n.pending && n.sequence > hold.sequence);
      assert.ok(firstNotice, 'Real production DOM showed this held pending state'); assert.deepEqual(firstNotice.connectedContextIds, [hold.contextId]);
      assert.equal(firstNotice.count, 1); assert.equal(firstNotice.role, 'status');
      const oldestHeldFence = Math.min(...current.fenceIds.map(id => state.fences.find(f => f.id === id).pendingPrefixTime));
      assert.ok(firstNotice.time - oldestHeldFence >= 5_000, 'Notice is feedback only after five seconds of pending native work');
      assert.equal(state.contexts.filter(c => c.sceneOwner).length, 1, 'Notice never remounts the first scene');
      return current;
    };
    const switchModel = async id => {
      await page.getByRole('button', { name: 'Switch model', exact: true }).click({ timeout: 15_000 });
      await page.getByRole('dialog').getByRole('button', { name: id === 'premium' ? /^Premium / : /^NISMO / }).click({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`/configurator/${id}$`), { timeout: 5_000 }); await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
    };
    const photoOnly = async () => {
      await expect(canvas).toHaveCount(0, { timeout: 5_000 }); await expect(rail).toHaveCount(0, { timeout: 5_000 });
      await expect(page.locator('.cabin-window-status, .scene-notice, .render-error')).toHaveCount(0, { timeout: 5_000 });
      await expect(page.locator('.reference-view img')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeDisabled({ timeout: 5_000 });
    };
    let firstContext, secondContext, thirdContext, firstCohort, warmCohort;
    await step('Load first native production owner and real cabin resources', async () => {
      await page.goto(`${target.baseUrl}/configurator/premium`, { waitUntil: 'domcontentloaded' }); await readyExterior();
      report.rendererInfo = await canvas.evaluate(element => { const gl = element.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), nativeDpr: devicePixelRatio }; });
      assert.match(report.rendererInfo.renderer, /SwiftShader/i); assert.equal(report.rendererInfo.nativeDpr, target.deviceScaleFactor);
      const state = await checkpoint('first-exterior-ready'); firstContext = state.firstSceneContextId; assert.ok(firstContext);
      const mark = await openCabin(); await capture('01-first-owner-real-cabin'); firstCohort = await cohort(mark, 'first-owner-active-cabin');
      assert.deepEqual(counts(), [1, 1, 1], 'All three exact original model bodies are requested once');
    });
    await step('Pending notice clears on actual completion without remount', async () => {
      const before = counts(), hold = await armAndShowNotice('completion-clear');
      const release = await page.evaluate(() => window.__r35RenderBackpressureLifecycle.releaseCompletion());
      await page.waitForFunction(release => window.__r35RenderBackpressureLifecycle.snapshot().polls.some(p => p.contextId === release.contextId && release.fenceIds.includes(p.fenceId) && p.sequence > release.releasedSequence && p.nativePositive && !p.substituted), release, { timeout: 5_000, polling: 50 });
      await expect(notice).toHaveCount(0, { timeout: 5_000 });
      const state = await checkpoint('native-completion-cleared-notice');
      assert.equal(state.contexts.length, 1); assert.equal(state.contexts[0].id, hold.contextId); assert.equal(state.contexts[0].connected, true); assert.equal(state.contexts[0].lostEvents, 0);
      assert.deepEqual(counts(), before, 'Native completion retains all model owners and request counts');
      assert.ok(state.notices.some(n => !n.pending && n.sequence > release.releasedSequence), 'DOM records notice removal after native completion');
    });
    await step('Native Retry viewer retires first owner and restores original exterior', async () => {
      const hold = await armAndShowNotice('manual-retry');
      await notice.getByRole('button', { name: 'Retry viewer', exact: true }).click({ timeout: 15_000 });
      const clicked = await checkpoint('trusted-retry-click');
      assert.equal(clicked.retryClicks.length, 1); assert.equal(clicked.holds[1].releaseReason, 'trusted-retry-capture');
      assert.ok(clicked.holds[1].releasedSequence > clicked.retryClicks[0].sequence); assert.equal(clicked.activeHoldId, null);
      await expect(notice).toHaveCount(0, { timeout: 5_000 });
      report.retryRetirement = await waitRetired(firstContext); await released(firstCohort, 'retry-closes-first-owner-cabin');
      await readyExterior(); await capture('02-retry-restored-original-exterior');
      const state = await checkpoint('retry-fresh-context-ready');
      const connected = state.contexts.filter(c => c.sceneOwner && c.connected); assert.equal(connected.length, 1);
      secondContext = connected[0].id; assert.notEqual(secondContext, firstContext); assert.equal(connected[0].lostEvents, 0);
      assert.equal(state.contexts.filter(c => c.sceneOwner).length, 2);
      const disposalFences = state.fences.filter(f => f.contextId === firstContext && f.sequence > state.retryClicks[0].releaseSequence);
      assert.ok(disposalFences.length > 0, 'Production native disposal creates a new old-context drain fence after the capture-phase release');
      assert.ok(disposalFences.some(f => state.polls.some(p => p.fenceId === f.id && p.nativePositive && !p.substituted)), 'Old disposal observes native completion without injected delay');
      assert.equal(state.polls.some(p => p.substituted && p.sequence > state.holds[1].releasedSequence), false, 'Fresh context and old disposal are never delayed');
      assert.ok(hold.fenceIds.every(id => state.fences.find(f => f.id === id)?.deleteCalls === 1), 'All held admission fences retire');
      assert.deepEqual(counts(), [1, 2, 2], 'Retry reloads exactly original exterior/proxy and does not silently enter full cabin');
      const rs = await settleResources(), current = rs.contexts.filter(c => c.sceneCanvas && c.canvasConnected);
      assert.equal(current.length, 1); assert.notEqual(current[0].id, firstCohort.contextIds[0], 'Resource observer independently proves a distinct context generation');
      const boundary = state.sequence; await page.waitForTimeout(5_000);
      const noticeScope = { afterSequence: boundary, retiredContextId: firstContext, activeContextId: secondContext };
      let quiet, freshStatus;
      // Genuine new-owner work may exceed the feedback threshold. Await its real
      // completion under the existing 30s completion-observation budget, then
      // retain the independent 5s UI-clearing bound. Old-owner proof stays strict.
      await expect.poll(async () => {
        quiet = await fixture(); assertRetiredFenceContext(quiet, firstContext);
        freshStatus = assessReplacementNotices(quiet, noticeScope);
        return freshStatus.awaitingCompletion;
      }, { timeout: 30_000 }).toBe(0);
      await expect.poll(async () => {
        quiet = await fixture(); assertRetiredFenceContext(quiet, firstContext);
        freshStatus = assessReplacementNotices(quiet, noticeScope);
        return freshStatus.awaitingCompletion + freshStatus.awaitingClear;
      }, { timeout: 5_000 }).toBe(0);
      await expect(notice).toHaveCount(0, { timeout: 5_000 });
      report.checkpoints.push({ label: 'retry-no-stale-notice-or-poll', state: quiet, freshStatus });
      assert.deepEqual(counts(), [1, 2, 2]);
    });
    await step('Native warm route navigation owns fresh resources and tears down cleanly', async () => {
      await switchModel('nismo'); await photoOnly(); await waitRetired(secondContext);
      await switchModel('premium'); await readyExterior();
      const state = await checkpoint('warm-premium-fresh-owner'); thirdContext = state.contexts.find(c => c.sceneOwner && c.connected)?.id;
      assert.ok(thirdContext && ![firstContext, secondContext].includes(thirdContext));
      const mark = await openCabin(); await capture('03-warm-owner-real-cabin'); warmCohort = await cohort(mark, 'warm-owner-active-cabin');
      assert.notEqual(warmCohort.contextIds[0], firstCohort.contextIds[0]); assert.deepEqual(counts(), [2, 3, 3]);
      await switchModel('nismo'); await photoOnly(); await released(warmCohort, 'warm-route-cabin-cleanup'); await waitRetired(thirdContext);
      const boundary = (await fixture()).sequence; await page.waitForTimeout(5_000); await photoOnly();
      const final = await checkpoint('warm-no-resurrection');
      for (const id of [firstContext, secondContext, thirdContext]) assertRetiredFenceContext(final, id);
      assert.equal(final.contexts.length, 3); assert.equal(final.contexts.some(c => c.connected), false);
      assert.equal(final.notices.some(n => n.pending && n.sequence > boundary), false); assert.deepEqual(counts(), [2, 3, 3]);
      await settleResources();
    });
    report.result = 'collected';
  } catch (error) { report.result = 'failed'; report.errors.push({ phase, message: String(error), stack: error.stack }); }
  finally {
    if (page) {
      try {
        report.fixture = await page.evaluate(() => window.__r35RenderBackpressureLifecycle?.snapshot());
        report.resources = await page.evaluate(() => window.__cabinResourceObserver?.snapshot());
        if (report.fixture) assertFenceObservationHealthy(report.fixture);
        await Promise.all(pendingBodies);
        for (const model of models) assert.ok(report.runtimeBodies.some(r => r.path === model.path && r.sha256 === model.sha256 && !r.error), `Runtime exact model identity required: ${model.path}`);
        assert.ok(report.runtimeBundleBodies.some(r => r.path === '/index.html') && report.runtimeBundleBodies.some(r => r.path.endsWith('.js')), 'Runtime production HTML/JS verified');
        assert.equal([...report.runtimeBodies, ...report.runtimeBundleBodies].some(r => r.error || !r.sha256), false, 'All runtime body identities completed');
        assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.requestFailures, []); assert.deepEqual(report.console.filter(r => r.type === 'error'), []);
        if (report.result === 'collected') report.result = 'passed';
      } catch (error) { report.result = 'failed'; report.errors.push({ phase: 'final evidence', message: String(error) }); }
    }
    await save();
    try { await browser?.close(); } catch (error) { report.result = 'failed'; report.errors.push({ phase: 'browser close', message: String(error) }); }
    if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    await save();
  }
  console.log(JSON.stringify({ result: report.result, sourceCommit, sourceTree: source.sha256, output, errors: report.errors }, null, 2));
  if (report.result !== 'passed') process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
