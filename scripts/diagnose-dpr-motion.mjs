/** Private CI-only normal-motion proof against an exact npm-built source checkout. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { validateMotionEnvironment, assessMotionEvidence, summarizeScenePixels, assertPointerMotionPixels } from './dpr-motion-policy.mjs';
import { installDprMotionObserver } from './dpr-motion-observer.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function applicationIdentity(directory = '.') {
  const paths = [];
  const walk = async name => {
    for (const entry of (await readdir(resolve(directory, name), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${name}/${entry.name}`;
      assert(!entry.isSymbolicLink(), 'Source identity cannot silently follow a symlink');
      if (entry.isDirectory()) await walk(path); else if (entry.isFile()) paths.push(path);
    }
  };
  await walk('src'); paths.push('index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs');
  const files = []; for (const path of paths.sort()) files.push({ path, sha256: hash(await readFile(resolve(directory, path))) });
  return { contract: 'r35-production-source-v2-with-index', sha256: hash(JSON.stringify(files)), files };
}
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? { samples: sorted.length, min: sorted[0], median: sorted[Math.floor((sorted.length - 1) / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) } : { samples: 0 };
};
export function summarizePhases(observation, resources) {
  const sceneIds = new Set(resources.contexts.filter(c => c.sceneCanvas).map(c => c.id));
  return observation.phases.map(phase => {
    const phaseFrames = resources.frames.filter(f => f.phase === phase.name && sceneIds.has(f.contextId));
    const frames = phaseFrames.filter(f => f.complete !== false);
    const timestamps = [...new Set(frames.map(f => f.timestamp))].sort((a, b) => a - b);
    const d = [
      ...observation.dimensions.filter(d => d.phase === phase.name),
      ...observation.events.filter(e => e.phase === phase.name && e.dimensions).map(e => e.dimensions),
    ];
    return { phase: phase.name, stableViewport: phase.stable, renderedFrames: frames.length, partialFramesExcluded: phaseFrames.length - frames.length,
      canvasWrites: observation.events.filter(e => e.phase === phase.name && e.kind === 'canvas-write').length,
      drawingBufferDimensions: [...new Set(d.map(d => `${d.width}x${d.height}`))], densitySampling: 'RAF-end and immediate native-write samples; not frame/time-weighted', backingPixels: distribution(d.map(d => d.width * d.height)),
      effectiveDprX: distribution(d.map(d => d.width / d.cssWidth)), drawCalls: distribution(frames.map(f => f.calls)), triangles: distribution(frames.map(f => f.triangles)),
      observedFrameSpacingMs: distribution(timestamps.slice(1).map((t, i) => t - timestamps[i])),
    };
  });
}
export async function optionalBoundingBox(locator) { return await locator.count() ? await locator.boundingBox() : null; }
export async function main(env = process.env) {
  // Deliberately first: do not import Playwright, app server or capture helpers before the gate.
  const target = validateMotionEnvironment(env);
  const root = resolve(env.R35_DPR_APP_ROOT ?? '.');
  const source = await applicationIdentity(root);
  assert.equal(source.sha256, env.R35_EXPECTED_APP_TREE, 'Built candidate source differs from reviewed identity');
  const sourceCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(sourceCommit, env.R35_SOURCE_SHA, 'Candidate checkout is not the exact approved source commit');
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '', 'Candidate production source must be clean');
  const harness = dirname(fileURLToPath(import.meta.url));
  const { cabinModels } = await import(pathToFileURL(resolve(harness, 'cabin-integration-policy.mjs')));
  const bundles = new Map([['/index.html', hash(await readFile(resolve(root, 'dist/index.html')))]]);
  for (const name of await readdir(resolve(root, 'dist/assets'))) if (/\.(?:js|css)$/.test(name)) bundles.set(`/assets/${name}`, hash(await readFile(resolve(root, 'dist/assets', name))));
  for (const model of cabinModels) {
    const bytes = await readFile(resolve(root, 'dist' + model.path));
    assert.equal(bytes.length, model.bytes); assert.equal(hash(bytes), model.sha256, `Built ${model.path} identity`);
  }
  const output = resolve(`dpr-motion-results/${target.mode}-${target.name}`); await mkdir(output, { recursive: true });
  const report = { mode: target.mode, viewport: target.name, sourceCommit, harnessCommit: env.GITHUB_SHA, sourceTree: source.sha256,
    geometryContract: target.geometryContract ?? null, expectedGeometry: target.geometry,
    renderer: 'Chromium ANGLE SwiftShader software WebGL only', reducedMotion: 'no-preference', nativeDeviceScaleFactor: target.deviceScaleFactor,
    scope: 'Actual production bundle; no app test hooks, app source changes, frame forcing, readPixels, GL state changes, or device-performance pass threshold.',
    limitations: ['SwiftShader timings cannot establish physical-device FPS or lag improvement.', 'Bounded composited screenshots can miss subframe or between-sample flicker; buffer-write/context observations run throughout.', 'Screenshots add readback overhead. Phase timing is descriptive; draw/triangle and backing-pixel changes are reported separately.'],
    steps: [], captures: [], screenshotRetries: [], console: [], pageErrors: [], requestFailures: [], runtimeBodies: [], runtimeBundleBodies: [], errors: [], result: 'running' };
  await writeFile(`${output}/identity.json`, JSON.stringify({ sourceCommit, harnessCommit: env.GITHUB_SHA, source, bundles: Object.fromEntries(bundles), models: cabinModels }, null, 2));
  const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await save();
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const { installCabinResourceObserver } = await import(pathToFileURL(resolve(harness, 'cabin-resource-observer.mjs')));
  const { observeOverlayRectangles, canvasPixelHash } = await import(pathToFileURL(resolve(harness, 'environment-pixel-comparison.mjs')));
  const { captureWithTimeoutRetry } = await import(pathToFileURL(resolve(harness, 'diagnose-configurator-controls.mjs')));
  const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
  let server, browser, context, page, phase = 'setup'; const pendingBodies = [];
  const step = async (name, action) => {
    const started = performance.now(); const entry = { name, result: 'running' }; report.steps.push(entry); await save();
    try { await action(); entry.result = 'passed'; }
    catch (error) { entry.result = 'failed'; entry.error = String(error); throw error; }
    finally { entry.elapsedMs = performance.now() - started; await save(); }
  };
  try {
    server = createAppServer(resolve(root, 'dist'));
    await new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); });
    browser = await chromium.launch({ timeout: 30_000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const { viewport, deviceScaleFactor, isMobile, hasTouch } = target;
    context = await browser.newContext({ viewport, deviceScaleFactor, isMobile: Boolean(isMobile), hasTouch: Boolean(hasTouch), reducedMotion: 'no-preference', serviceWorkers: 'block' });
    // One init script guarantees wrap ordering; neither observer schedules rendering.
    await context.addInitScript({ content: `(${installCabinResourceObserver.toString()})({maxFrames:8192});(${installDprMotionObserver.toString()})({maxRecords:8192});` });
    page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page); const requests = new Map();
    await cdp.send('Network.enable', { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 256 * 1024 * 1024 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      const path = new URL(response.url).pathname; const model = cabinModels.find(m => m.path === path);
      if (!model) return;
      const record = { requestId, path, url: response.url, status: response.status, phase }; requests.set(requestId, record); report.runtimeBodies.push(record);
    });
    cdp.on('Network.loadingFinished', ({ requestId }) => {
      const record = requests.get(requestId); if (!record) return;
      pendingBodies.push((async () => {
        const expected = cabinModels.find(m => m.path === record.path); const body = await cdp.send('Network.getResponseBody', { requestId });
        const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'); record.sha256 = hash(bytes); record.bytes = bytes.length;
        assert.equal(record.url, target.baseUrl + record.path); assert.equal(record.status, 200); assert.equal(record.bytes, expected.bytes); assert.equal(record.sha256, expected.sha256);
      })().catch(error => { record.error = String(error); }));
    });
    page.on('response', response => {
      const url = new URL(response.url()); const path = url.pathname === '/configurator/premium' ? '/index.html' : url.pathname;
      if (!bundles.has(path)) return;
      const record = { path, url: response.url(), phase, status: response.status() }; report.runtimeBundleBodies.push(record);
      pendingBodies.push((async () => { const bytes = await response.body(); record.sha256 = hash(bytes); assert.equal(url.origin, target.baseUrl); assert.equal(record.status, 200); assert.equal(record.sha256, bundles.get(path)); })().catch(error => { record.error = String(error); }));
    });
    page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.console.push({ phase, type: message.type(), text: message.text() }); });
    page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    const canvas = page.locator('.scene-stage canvas'); const rail = page.locator('footer[aria-label="Cabin preview controls"]');
    const mark = async (name, stable) => {
      phase = name;
      await page.evaluate(({ name, stable }) => { window.__cabinResourceObserver.mark(name); window.__r35DprMotion.mark(name, stable); }, { name, stable });
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false, 'Normal motion must remain enabled');
    };
    const capture = async label => {
      assert(report.captures.length < 20, 'Bounded screenshot capacity exceeded');
      const bounds = await canvas.boundingBox(); assert(bounds && bounds.width > 200 && bounds.height > 200);
      const overlays = await page.evaluate(observeOverlayRectangles);
      const cabinRail = await optionalBoundingBox(rail); if (cabinRail) overlays.push({ name: 'cabin-control-rail', ...cabinRail });
      const file = `${output}/${label}.png`; const started = performance.now();
      const png = await captureWithTimeoutRetry(() => page.screenshot({ path: file, timeout: 45_000, scale: 'css' }), async error => { report.screenshotRetries.push({ phase, captureRetry: label, reason: error.message, maxAttempts: 2, timeoutMs: 45_000 }); await save(); });
      assert.deepEqual(await canvas.boundingBox(), bounds, 'Capture must retain the measured viewport');
      const pixels = summarizeScenePixels(PNG.sync.read(png), bounds, overlays);
      report.captures.push({ phase, label, file: `${label}.png`, elapsedMs: performance.now() - started, sha256: hash(png), ...pixels, scene: canvasPixelHash(png, bounds, overlays) });
      await save(); return report.captures.at(-1);
    };
    const inputPoint = () => canvas.evaluate(element => {
      const r = element.getBoundingClientRect();
      for (const y of [.45, .55, .35, .65]) for (const x of [.5, .35, .65]) {
        const p = { x: r.x + r.width * x, y: r.y + r.height * y }; if (document.elementFromPoint(p.x, p.y) === element) return p;
      } throw new Error('No unobscured native canvas pointer target');
    });
    const drag = async (direction = 1) => {
      const p = await inputPoint(); await page.mouse.move(p.x, p.y); await page.mouse.down();
      try { for (let i = 1; i <= 12; i++) { await page.mouse.move(p.x + direction * i * 4, p.y + Math.sin(i / 3) * 8); await page.waitForTimeout(75); } }
      finally { await page.mouse.up(); }
    };
    await step('Load the exact production Premium scene', async () => {
      await page.goto(`${target.baseUrl}/configurator/premium`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
      await expect(canvas).toHaveCount(1, { timeout: 5_000 }); await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0, { timeout: 5_000 });
      report.rendererInfo = await canvas.evaluate(element => { const gl = element.getContext('webgl2') || element.getContext('webgl'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { version: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), nativeDpr: devicePixelRatio }; });
      assert.match(report.rendererInfo.renderer, /SwiftShader/i); assert.equal(report.rendererInfo.nativeDpr, target.deviceScaleFactor);
      await page.waitForTimeout(1500); await mark('exterior-idle-before', true); await capture('01-exterior-before');
    });
    await step('Sustained native orbit and parent control updates', async () => {
      await mark('exterior-orbit', true);
      await drag(1); await capture('02-orbit-mid'); await drag(-1); await drag(1); await capture('03-orbit-end');
      await mark('exterior-controls-rotating', true);
      const rotate = page.getByRole('button', { name: 'Rotate', exact: true }); await rotate.click(); await expect(rotate).toHaveAttribute('aria-pressed', 'true');
      const lights = page.getByRole('button', { name: 'Lights', exact: true });
      for (let i = 0; i < 6; i++) { await lights.click(); await page.waitForTimeout(350); if (i === 2) await capture('04-controls-mid'); }
      await capture('05-controls-end'); await rotate.click(); await expect(rotate).toHaveAttribute('aria-pressed', 'false');
      await mark('exterior-idle-after', true); await page.waitForTimeout(4000); await capture('06-exterior-idle');
    });
    await step('Opt into real cabin then sustain look and seat updates', async () => {
      await mark('cabin-entry', true); await page.getByRole('button', { name: 'Camera', exact: true }).click({ timeout: 15_000 });
      await page.getByRole('dialog').getByRole('button', { name: 'Cabin preview · work in progress', exact: true }).click({ timeout: 15_000 });
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
      await expect(rail.getByRole('button', { name: 'Driver', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 90_000 });
      await expect(canvas).toHaveAttribute('aria-label', /fixed seat/, { timeout: 5_000 }); await capture('07-cabin-driver');
      await mark('cabin-look', true); await drag(1); await capture('08-cabin-look-mid'); await drag(-1);
      await canvas.focus(); for (let i = 0; i < 8; i++) { await canvas.press(i < 4 ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(100); }
      await capture('09-cabin-look-end');
      await mark('cabin-seat-controls', true);
      for (const seat of ['Passenger', 'Rear seat', 'Driver']) { await rail.getByRole('button', { name: seat, exact: true }).click(); await expect(rail.getByRole('button', { name: seat, exact: true })).toHaveAttribute('aria-pressed', 'true'); await page.waitForTimeout(350); }
      await capture('10-cabin-seats'); await mark('cabin-idle', true); await page.waitForTimeout(4000); await capture('11-cabin-idle');
    });
    await step('Deliberate viewport resize is isolated from stable-size acceptance', async () => {
      await mark('viewport-change', false);
      const changed = target.name === 'mobile' ? { width: 430, height: 900 } : { width: 1280, height: 800 };
      const oldBounds = await canvas.boundingBox();
      await page.setViewportSize(changed);
      await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })), { timeout: 5_000 }).toEqual(changed);
      await expect.poll(async () => { const bounds = await canvas.boundingBox(); return bounds && bounds.width !== oldBounds.width && bounds.height !== oldBounds.height; }, { timeout: 5_000 }).toBe(true);
      await page.waitForTimeout(1000); await mark('resized-cabin-look', true); await drag(1); await capture('12-resized-look');
      await mark('resized-cabin-idle', true); await page.waitForTimeout(4000); await capture('13-resized-idle');
    });
    report.result = 'collected';
  } catch (error) { report.result = 'failed'; report.errors.push({ phase, message: String(error), stack: error.stack }); }
  finally {
    if (page) {
      try {
        const { observation, resources } = await page.evaluate(() => ({ observation: window.__r35DprMotion.snapshot(), resources: window.__cabinResourceObserver.snapshot() }));
        await writeFile(`${output}/buffer-events.json`, JSON.stringify(observation, null, 2)); await writeFile(`${output}/resource-frames.json`, JSON.stringify(resources, null, 2));
        report.phaseSummary = summarizePhases(observation, resources);
        report.assessment = assessMotionEvidence({ mode: target.mode, observation, pixels: report.captures, geometryContract: target.geometryContract, sourceTree: source.sha256, viewport: target.name });
        report.baselineChurnObserved = target.mode === 'baseline' ? report.assessment.stableWrites.length > 0 : null;
        if (resources.issues.length) report.assessment.failures.push(...resources.issues);
        for (const name of ['exterior-orbit', 'exterior-controls-rotating', 'cabin-look', 'cabin-seat-controls', 'resized-cabin-look']) {
          const stats = report.phaseSummary.find(s => s.phase === name);
          if (!stats || stats.renderedFrames < 2 || !(stats.drawCalls.max > 0 && stats.triangles.max > 0)) report.assessment.failures.push(`${name}: missing sustained rendered-frame evidence`);
        }
        if (report.captures.length !== 13) report.assessment.failures.push('All 13 bounded normal-motion captures are required');
        for (const [before, after] of [['01-exterior-before', '03-orbit-end'], ['07-cabin-driver', '08-cabin-look-mid']]) {
          const first = report.captures.find(c => c.label === before), last = report.captures.find(c => c.label === after);
          if (first && last && !first.blank && !last.blank) {
            try { assertPointerMotionPixels(first, last); }
            catch (error) { report.assessment.failures.push(`${after}: ${error.message}`); }
          }
        }
        const resize = observation.events.filter(e => e.phase === 'viewport-change' && e.kind === 'canvas-write');
        if (!resize.length) report.assessment.failures.push('Deliberate viewport resize did not produce observed native buffer writes');
        await Promise.all(pendingBodies);
        for (const model of cabinModels) if (!report.runtimeBodies.some(r => r.path === model.path && r.sha256 === model.sha256 && !r.error)) report.assessment.failures.push(`Missing runtime model identity: ${model.path}`);
        if (!report.runtimeBundleBodies.some(r => r.path === '/index.html') || !report.runtimeBundleBodies.some(r => r.path.endsWith('.js'))) report.assessment.failures.push('Missing runtime production HTML/JS identity');
        if ([...report.runtimeBodies, ...report.runtimeBundleBodies].some(r => r.error || !r.sha256)) report.assessment.failures.push('Runtime body verification incomplete or mismatched');
        if (report.pageErrors.length || report.requestFailures.length || report.console.some(r => r.type === 'error')) report.assessment.failures.push('Unexpected browser/page/request errors');
        if (report.assessment.failures.length) report.result = 'failed';
        else if (report.result === 'collected') report.result = target.mode === 'baseline' ? 'baseline-measured' : 'passed';
      } catch (error) { report.result = 'failed'; report.errors.push({ phase: 'evidence collection', message: String(error) }); }
    }
    await save(); await browser?.close().catch(error => report.errors.push({ phase: 'browser close', message: String(error) }));
    if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    await save();
  }
  console.log(JSON.stringify({ result: report.result, sourceCommit, sourceTree: source.sha256, assessment: report.assessment, phaseSummary: report.phaseSummary }, null, 2));
  if (!['passed', 'baseline-measured'].includes(report.result)) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
