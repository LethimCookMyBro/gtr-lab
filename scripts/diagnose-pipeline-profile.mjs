/** Separate bounded pipeline attribution; one post-orbit screenshot, never an acceptance replacement. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {validatePipelineEnvironment,profileLimits} from './pipeline-profile-policy.mjs';
import {createPipelineCollector,createSingleProfiledCapture} from './pipeline-profile-collector.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function within(promise, milliseconds, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded its ${milliseconds}ms evidence budget`)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
export async function main(env = process.env) {
  const target = validatePipelineEnvironment(env); // Before app/helper/browser/server imports or setup.
  const root = resolve(env.R35_PIPELINE_APP_ROOT ?? '.'); const harness = dirname(fileURLToPath(import.meta.url));
  const { applicationIdentity } = await import(pathToFileURL(resolve(harness, 'diagnose-dpr-motion.mjs')));
  const source = await applicationIdentity(root);
  assert.equal(source.sha256, env.R35_PIPELINE_SOURCE_TREE, 'Reviewed fixed application identity required');
  assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), env.R35_PIPELINE_SOURCE_SHA);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '', 'Production source must remain clean');
  const {featureLaunchOptions,validateActualArguments,expectedNativeGeometry}=await import(pathToFileURL(resolve(harness,'screenshot-feature-policy.mjs')));
  const {launchFeatureBrowser}=await import(pathToFileURL(resolve(harness,'diagnose-screenshot-feature.mjs')));
  const { captureModels, mapCaptureGeometry, assessCaptureBoundary } = await import(pathToFileURL(resolve(harness, 'capture-path-policy.mjs')));
  const cabinModels = captureModels; // Immutable reviewed two-model manifest; independent of future harness policies.
  const exterior = cabinModels.find(m => m.path === '/models/ciasny-r35.glb'); assert(exterior);
  for (const model of cabinModels) { const bytes = await readFile(resolve(root, 'dist' + model.path)); assert.equal(bytes.length, model.bytes); assert.equal(hash(bytes), model.sha256); }
  const bundles = new Map([['/index.html', hash(await readFile(resolve(root, 'dist/index.html')))]]);
  for (const name of await readdir(resolve(root, 'dist/assets'))) if (/\.(?:js|css)$/.test(name)) bundles.set(`/assets/${name}`, hash(await readFile(resolve(root, 'dist/assets', name))));
  const output = resolve(`pipeline-profile-results/desktop`); await mkdir(output, { recursive: true });
  const report = {
    scope: 'Bounded pipeline profile only; original normal-motion acceptance remains failed/incomplete', originalAcceptanceChanged: false,
    sourceCommit: env.R35_PIPELINE_SOURCE_SHA, sourceTree: source.sha256, harnessCommit: env.GITHUB_SHA,
    featureMode: 'default', viewport: target.name, viewportSize: target.viewport, nativeDeviceScaleFactor: target.deviceScaleFactor, scale: target.scale, protocolAttribution: false,
    reducedMotion: 'no-preference', result: 'running', steps: [], captures: [], attempts: [], inputs: [], errors: [], console: [], pageErrors: [], requestFailures: [], runtimeBodies: [],
    limits: { screenshotMs: 45_000, maxScreenshotAttempts: 1, clickMs: 15_000, readinessMs: 90_000, navigationMs: 45_000, evidenceMs: 5_000 },
    measurementDesign: 'No initial screenshot; one post-orbit 45s capture only, no retry. This avoids piling new captures onto timed-out commands.',
    limitations: ['SwiftShader CI process CPU is not physical-device GPU time or FPS.', 'No initial PNG means this profile does not independently re-prove pointer pixel change; it records native input and completed scene frames.', 'Explicit bounded timeline and CPU sampling add measurement overhead. Raw trace stays CI/local and is never a Library artifact.', 'Protocol debug serialization is disabled; previous evidence already located the stall after Page.captureScreenshot send.', 'Trace overflow, missing renderer/GPU tracks, CPU discontinuity or incomplete export makes attribution inconclusive.'],
  };
  const save = () => within(writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)),5_000,'Report write');
  await writeFile(`${output}/identity.json`, JSON.stringify({ source, sourceCommit: report.sourceCommit, harnessCommit: report.harnessCommit, bundles: Object.fromEntries(bundles), models: cabinModels }, null, 2)); await save();
  const { installProtocolSink, runCaptureAttempt } = await import(pathToFileURL(resolve(harness, 'diagnose-capture-path.mjs')));
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const { installCabinResourceObserver } = await import(pathToFileURL(resolve(harness, 'cabin-resource-observer.mjs')));
  const { installDprMotionObserver } = await import(pathToFileURL(resolve(harness, 'dpr-motion-observer.mjs')));
  const { observeOverlayRectangles, canvasPixelHash } = await import(pathToFileURL(resolve(harness, 'environment-pixel-comparison.mjs')));
  const { summarizeScenePixels, assessMotionEvidence } = await import(pathToFileURL(resolve(harness, 'dpr-motion-policy.mjs')));
  const require = createRequire(import.meta.url); const { PNG, debug } = require('playwright-core/lib/utilsBundle');
  assert.equal(debug.enabled('pw:protocol'), false, 'No ambient protocol logger permitted');
  report.playwrightVersion = require('playwright-core/package.json').version; assert.equal(report.playwrightVersion, '1.63.0', 'Reviewed Playwright version required');
  let browser, browserCdp, collector, singleCapture, server, page, phase = 'setup'; const pendingBodies = [];
  const sink = installProtocolSink({ enabled: false, debug, phase: () => phase });
  const step = async (name, action) => {
    const row = { name, startedAt: performance.now(), result: 'running' }; report.steps.push(row); await save();
    try { await action(); row.result = 'observed'; } catch (error) { row.result = 'failed'; row.error = String(error); throw error; }
    finally { row.elapsedMs = performance.now() - row.startedAt; await save(); }
  };
  try {
    server = createAppServer(resolve(root, 'dist'));
    await new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); });
    report.featureLaunchOptions = featureLaunchOptions('default'); report.browserArgs = report.featureLaunchOptions.args;
    browser = await launchFeatureBrowser(chromium, 'default'); report.browserVersion = browser.version(); assert.equal(report.browserVersion, '153.0.8010.12', 'Reviewed Chromium version required');
    browserCdp = await browser.newBrowserCDPSession();
    report.actualBrowserArguments = (await within(browserCdp.send('Browser.getBrowserCommandLine'), 5_000, 'Actual browser command line')).arguments;
    report.normalizedBrowserArguments = validateActualArguments('default', report.actualBrowserArguments); await save();
    collector=createPipelineCollector({cdp:browserCdp,phase:()=>phase,writeTrace:bytes=>writeFile(`${output}/pipeline-trace.json`,bytes)});singleCapture=createSingleProfiledCapture(collector);
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, isMobile: Boolean(target.isMobile), hasTouch: Boolean(target.hasTouch), reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.addInitScript({ content: `(${installCabinResourceObserver.toString()})({maxFrames:8192});(${installDprMotionObserver.toString()})({maxRecords:8192});` });
    page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page); const tracked = new Map();
    await cdp.send('Network.enable', { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 256 * 1024 * 1024 }); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      const url = new URL(response.url), path = url.pathname === '/configurator/premium' ? '/index.html' : url.pathname;
      if (!bundles.has(path) && path !== exterior.path) return;
      const row = { requestId, path, url: response.url, status: response.status, phase }; tracked.set(requestId, row); report.runtimeBodies.push(row);
    });
    cdp.on('Network.loadingFinished', ({ requestId }) => {
      const row = tracked.get(requestId); if (!row) return;
      pendingBodies.push((async () => {
        const body = await cdp.send('Network.getResponseBody', { requestId }); const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'); row.bytes = bytes.length; row.sha256 = hash(bytes);
        assert.equal(new URL(row.url).origin, target.baseUrl); assert.equal(row.status, 200); assert.equal(row.sha256, row.path === exterior.path ? exterior.sha256 : bundles.get(row.path)); if (row.path === exterior.path) assert.equal(row.bytes, exterior.bytes);
      })().catch(error => { row.error = String(error); }));
    });
    page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.console.push({ phase, type: message.type(), text: message.text() }); });
    page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    const canvas = page.locator('.scene-stage canvas');
    const geometry = () => within(canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl'); const r = element.getBoundingClientRect(); const observation = window.__r35DprMotion.snapshot();
      return { nativeDpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, canvas: { x: r.x, y: r.y, width: r.width, height: r.height }, buffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }, attributes: { width: element.width, height: element.height }, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, contexts: observation.contexts, observation: { canvasWrites: observation.events.filter(e => e.kind === 'canvas-write').length, contextEvents: observation.events.filter(e => ['webglcontextlost', 'webglcontextrestored'].includes(e.kind)).length, dimensionSamples: observation.dimensions.length } };
    }), 5_000, 'Capture-boundary geometry');
    const mark = async name => { phase = name; await within(page.evaluate(name => { window.__r35DprMotion.mark(name, true); window.__cabinResourceObserver.mark(name); }, name), 5_000, 'Phase marker'); };
    const capture = async label => {
      await mark(label); const bounds = await canvas.boundingBox(), overlays = await within(page.evaluate(observeOverlayRectangles), 5_000, 'DOM exclusion measurement'); assert(bounds);
      assert(collector.active(),'Profile already stopped; do not enqueue a screenshot');
      const attempt=1,row={label,attempt,result:'running'};report.attempts.push(row);phase=`${label}-attempt-1`;await save();
      await collector.mark('single-capture');let bytes;
      try { bytes=await runCaptureAttempt({row,geometry,sink,save,capture:()=>singleCapture.run(()=>page.screenshot({path:`${output}/${label}.png`,timeout:45_000,scale:'css'}))}); }
      finally { report.pipeline=await singleCapture.finish();await save(); }
      assert.deepEqual(await canvas.boundingBox(), bounds, 'Measured canvas bounds must remain unchanged');
      assert.deepEqual(await within(page.evaluate(observeOverlayRectangles), 5_000, 'DOM exclusion remeasurement'), overlays, 'Measured DOM exclusions must remain unchanged across capture');
      const png = PNG.sync.read(bytes); const mapped = mapCaptureGeometry({ png, viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, scale: target.scale, bounds, overlays });
      const pixels = summarizeScenePixels(png, mapped.pixelBounds, mapped.overlays), scene = canvasPixelHash(bytes, mapped.pixelBounds, mapped.overlays);
      assert(pixels.pixels > mapped.bounds.width * mapped.bounds.height / 2 && scene.comparedPixels > mapped.bounds.width * mapped.bounds.height / 2, 'Must retain more than half the full original canvas');
      report.captures.push({ label, phase, pngWidth: png.width, pngHeight: png.height, outputScale: target.scale, mappingFactor: mapped.factor, bounds: mapped.bounds, pixelAnalysisBounds: mapped.pixelBounds, insetCssPixels: mapped.insetCssPixels, overlays: mapped.overlays,
        sha256: hash(bytes), ...pixels, scene }); await save();
    };
    await step('Load fixed exterior; verify geometry without initial capture', async () => {
      await page.goto(target.baseUrl + '/configurator/premium', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Ultimate Silver', exact: true })).toBeEnabled({ timeout: 90_000 });
      await expect(canvas).toHaveCount(1, { timeout: 5_000 }); await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0, { timeout: 5_000 });
      report.renderer = await within(canvas.evaluate(element => { const gl = element.getContext('webgl2') || element.getContext('webgl'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }), 5_000, 'Renderer identification'); assert.match(report.renderer, /SwiftShader/i);
      await page.waitForTimeout(1500); const g = await geometry(); report.initialGeometry = { nativeDpr: g.nativeDpr, viewport: g.viewport, canvas: g.canvas, buffer: g.buffer };
      assert.deepEqual(report.initialGeometry, expectedNativeGeometry, 'Exact reviewed desktop native geometry required'); assert.equal(g.nativeDpr, target.deviceScaleFactor); assert.equal(g.reducedMotion, false);
    });
    await step('Profile native orbit and one post-orbit capture', async () => {
      await collector.start();await mark('orbit-input');await collector.mark('orbit-input');
      const p = await within(canvas.evaluate(element => { const r = element.getBoundingClientRect(); for (const y of [.45, .55, .35, .65]) for (const x of [.5, .35, .65]) { const p = { x: r.x + r.width * x, y: r.y + r.height * y }; if (document.elementFromPoint(p.x, p.y) === element) return p; } throw new Error('No unobscured native pointer target'); }), 5_000, 'Native pointer target measurement');
      const input = async (name, action) => { const row = { name, startedAt: performance.now() }; report.inputs.push(row); try { assert(collector.active(),'Profile window ended; stop input');await within(action(),profileLimits.inputMs,`Native input ${name}`); row.result = 'completed'; } catch (error) { row.result = 'failed'; row.error = String(error); throw error; } finally { row.elapsedMs = performance.now() - row.startedAt; } };
      await input('move-to-canvas', () => page.mouse.move(p.x, p.y)); await input('pointer-down', () => page.mouse.down());
      try { for (let i = 1; i <= 12; i++) { await input(`move-${i}`, () => page.mouse.move(p.x + i * 4, p.y + Math.sin(i / 3) * 8)); await page.waitForTimeout(75); } }
      finally { const startedAt=performance.now();try{await within(page.mouse.up(),5_000,'Pointer release cleanup');report.inputs.push({name:'pointer-up',startedAt,elapsedMs:performance.now()-startedAt,result:'completed'});}catch(error){report.inputs.push({name:'pointer-up',startedAt,elapsedMs:performance.now()-startedAt,result:'failed',error:String(error)});throw error;}finally{await save();} }
      await capture('02-orbit');
    });
    report.result = 'observed';
  } catch (error) { report.result = 'failed'; report.errors.push({ phase, kind: 'lane-failure', message: String(error), stack: error.stack }); }
  finally {
   try {
    sink.stop(); report.protocol = sink.snapshot();
    if(collector){report.pipeline=await collector.stop('scenario-ended');await within(writeFile(`${output}/pipeline-profile.json`,JSON.stringify(report.pipeline,null,2)),5_000,'Profile evidence write');}
    if (page) try {
      const { observation, resources } = await within(page.evaluate(() => ({ observation: window.__r35DprMotion.snapshot(), resources: window.__cabinResourceObserver.snapshot() })), 5_000, 'Final observer evidence');
      await within(writeFile(`${output}/buffer-events.json`, JSON.stringify(observation, null, 2)),5_000,'Buffer evidence write'); await within(writeFile(`${output}/resource-frames.json`, JSON.stringify(resources, null, 2)),5_000,'Resource evidence write');
      report.assessment = assessMotionEvidence({ mode: 'fixed', observation, pixels: report.captures });
      report.assessment.failures.push(...resources.issues, ...(report.protocol.issues ?? []));
      for (const row of report.attempts) {
        if (!row.before || !row.after) report.assessment.failures.push(`${row.label} attempt ${row.attempt}: missing capture-boundary geometry`);
        else try { for(const g of [row.before,row.after])assert.deepEqual({nativeDpr:g.nativeDpr,viewport:g.viewport,canvas:g.canvas,buffer:g.buffer},expectedNativeGeometry,'Exact reviewed capture-boundary native geometry required');row.boundary = assessCaptureBoundary(row.before, row.after); } catch (error) { report.assessment.failures.push(`${row.label} attempt ${row.attempt}: ${error.message}`); }
      }
      if (report.captures.length !== 1) report.assessment.failures.push('Single orbit capture failed; blank-pixel evidence unavailable, not classified as nonblank');
      if(report.pipeline?.status!=='collected')report.assessment.failures.push('Pipeline attribution incomplete/inconclusive');
      const sceneIds = new Set(resources.contexts.filter(c => c.sceneCanvas).map(c => c.id));
      if (resources.frames.filter(f => sceneIds.has(f.contextId) && f.complete !== false && ['orbit-input', '02-orbit'].includes(f.phase) && f.calls > 0 && f.triangles > 0).length < 2) report.assessment.failures.push('Missing sustained rendered orbit evidence');
      await within(Promise.all(pendingBodies), 5_000, 'Runtime body identity settlement');
      for (const path of ['/index.html', exterior.path]) if (!report.runtimeBodies.some(r => r.path === path && r.sha256 && !r.error)) report.assessment.failures.push(`Missing runtime body: ${path}`);
      if (!report.runtimeBodies.some(r => r.path.endsWith('.js'))) report.assessment.failures.push('Missing runtime production JavaScript body');
      if (report.runtimeBodies.some(r => !r.sha256 || r.error)) report.assessment.failures.push('Runtime body identity failure/incomplete');
      if (report.pageErrors.length || report.requestFailures.length || report.console.some(r => r.type === 'error')) report.assessment.failures.push('Unexpected browser/page/request errors');
      if (report.assessment.failures.length) report.result = 'failed';
    } catch (error) { report.result = 'failed'; report.errors.push({ phase: 'evidence collection', message: String(error) }); }
   } catch(error){report.result='failed';report.errors.push({phase:'profile evidence',message:String(error)});}
   finally {
    for(const [name,action] of [['profile CDP detach',()=>browserCdp?.detach()],['browser close',()=>browser?.close()],['server close',()=>{if(server?.listening){server.closeAllConnections();return new Promise(done=>server.close(done));}}]]) {
      try{await within(Promise.resolve().then(action),5_000,name);}catch(error){report.result='failed';report.errors.push({phase:'profile cleanup',message:String(error)});}
    }
    try{await within(save(),5_000,'Final report write');}catch(error){report.result='failed';console.error('Final report write failed:',String(error));}
   }
  }
  console.log(JSON.stringify({ result: report.result, featureMode: report.featureMode, viewport: report.viewport, scale: report.scale, originalAcceptanceChanged: false, sourceCommit: report.sourceCommit, captures: report.captures.map(c => ({ label: c.label, blank: c.blank, pngWidth: c.pngWidth, pngHeight: c.pngHeight })), assessment: report.assessment }, null, 2));
  if (report.result !== 'observed') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
