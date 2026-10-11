/** Private source-pinned fence observation. This is never screenshot acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { validateDrainedKeyEnvironment, assessDrainedKeyObservation, modelPins, limits } from './drained-key-policy.mjs';
import { installDrainedKeyObserver } from './drained-key-observer.mjs';
import { waitForCleanGate, classifyKeys } from './drained-key-gates.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
export async function main(env = process.env) {
  const target = validateDrainedKeyEnvironment(env); // Before browser/app/helper imports or setup.
  const root = resolve(env.R35_DRAINED_KEY_APP_ROOT ?? '.'), harness = dirname(fileURLToPath(import.meta.url));
  const { applicationIdentity } = await import(pathToFileURL(resolve(harness, 'diagnose-dpr-motion.mjs')));
  const source = await applicationIdentity(root);
  assert.equal(source.sha256, env.R35_DRAINED_KEY_SOURCE_TREE, 'Exact reviewed application bytes required');
  assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), env.R35_DRAINED_KEY_SOURCE_SHA);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '', 'Candidate production bytes must remain clean');
  const { featureLaunchOptions, validateActualArguments, expectedNativeGeometry } = await import(pathToFileURL(resolve(harness, 'screenshot-feature-policy.mjs')));
  const { launchFeatureBrowser } = await import(pathToFileURL(resolve(harness, 'diagnose-screenshot-feature.mjs')));
  const { mapCaptureGeometry } = await import(pathToFileURL(resolve(harness, 'capture-path-policy.mjs')));
  const { summarizeScenePixels } = await import(pathToFileURL(resolve(harness, 'dpr-motion-policy.mjs')));
  const { observeOverlayRectangles, canvasPixelHash } = await import(pathToFileURL(resolve(harness, 'environment-pixel-comparison.mjs')));
  const { installDprMotionObserver } = await import(pathToFileURL(resolve(harness, 'dpr-motion-observer.mjs')));
  const bundles = new Map([['/index.html', hash(await readFile(resolve(root, 'dist/index.html')))]]);
  for (const name of await readdir(resolve(root, 'dist/assets'))) if (/\.(?:js|css)$/.test(name)) bundles.set(`/assets/${name}`, hash(await readFile(resolve(root, 'dist/assets', name))));
  for (const model of modelPins) { const bytes = await readFile(resolve(root, 'dist' + model.path)); assert.equal(bytes.length, model.bytes); assert.equal(hash(bytes), model.sha256); }
  const output = resolve('drained-key-results/desktop'); await mkdir(output, { recursive: true });
  const report = { scope: 'Three sequential native keys after clean checkpoint gates; one post-completion screenshot only', originalAcceptanceChanged: false, result: 'running', sourceCommit: env.R35_DRAINED_KEY_SOURCE_SHA, sourceTree: source.sha256, harnessCommit: env.GITHUB_SHA,
    reducedMotion: 'no-preference', viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, limits, featureMode: 'default', explicitJavascriptFlush: false,
    limitations: ['One 45s screenshot after the third valid gate is diagnostic only; original 13-capture drag acceptance remains unchanged.', 'Pending counts are unobserved completion counts, not known GPU queue depth.', 'No explicit JavaScript flush is called, but pinned Chromium query polling and ANGLE fence creation can internally flush/submit work. The instrumentation is not a passive scheduling control.', 'Pinned ANGLE Vulkan may use global-EGL fence scope and include other earlier context work. Completion proves earlier app commands complete, not app-only GPU execution time.', 'Observable signal brackets include task-gated caching, command-buffer scheduling, polling delay and measurement overhead. SwiftShader results are not hardware FPS.', 'A naturally drained entry removes earlier tracked app-command backlog only. It cannot exclude compositor contention or later browser resolve/export work.'],
    steps: [], inputs: [], gates: [], captures: [], runtimeBodies: [], pageErrors: [], console: [], requestFailures: [], errors: [], geometry: [] };
  const save = () => bounded(writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)), 5_000, 'Report write');
  await writeFile(`${output}/identity.json`, JSON.stringify({ source, sourceCommit: report.sourceCommit, harnessCommit: report.harnessCommit, bundles: Object.fromEntries(bundles), models: modelPins }, null, 2)); await save();
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const require = createRequire(import.meta.url); const { PNG } = require('playwright-core/lib/utilsBundle'); assert.equal(require('playwright-core/package.json').version, '1.63.0');
  let server, browser, browserCdp, page, phase = 'setup', observerEvidence;
  const pendingBodies = [], bodyRequests = new Map();
  const step = async (name, action) => { const row = { name, startedAt: performance.now(), result: 'running' }; report.steps.push(row); await save(); try { await action(); row.result = 'observed'; } catch (error) { row.result = 'failed'; row.error = String(error); throw error; } finally { row.elapsedMs = performance.now() - row.startedAt; await save(); } };
  try {
    server = createAppServer(resolve(root, 'dist'));
    await bounded(new Promise((done, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', done); }), 5_000, 'CI server startup');
    report.launchOptions = featureLaunchOptions('default'); browser = await launchFeatureBrowser(chromium, 'default'); report.browserVersion = browser.version(); assert.equal(report.browserVersion, '153.0.8010.12');
    browserCdp = await bounded(browser.newBrowserCDPSession(), 5_000, 'Browser session');
    report.actualBrowserArguments = (await bounded(browserCdp.send('Browser.getBrowserCommandLine'), 5_000, 'Actual browser arguments')).arguments;
    report.normalizedBrowserArguments = validateActualArguments('default', report.actualBrowserArguments);
    report.gpu = (await bounded(browserCdp.send('SystemInfo.getInfo'), 5_000, 'Browser GPU metadata')).gpu; assert.match(JSON.stringify(report.gpu), /SwiftShader/i);
    const context = await bounded(browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, reducedMotion: 'no-preference', serviceWorkers: 'block' }), 5_000, 'Browser context');
    await context.addInitScript({ content: `(${installDprMotionObserver.toString()})({maxRecords:8192});(${installDrainedKeyObserver.toString()})({windowMs:${limits.observerMs}});` });
    page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page);
    await bounded(cdp.send('Network.enable', { maxResourceBufferSize: 64*1024*1024, maxTotalBufferSize: 256*1024*1024 }), 5_000, 'Network identity observation');
    await bounded(cdp.send('Network.setCacheDisabled', { cacheDisabled: true }), 5_000, 'Disable cache');
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      const url = new URL(response.url), path = url.pathname === '/configurator/premium' ? '/index.html' : url.pathname;
      if (!bundles.has(path) && !modelPins.some(m => m.path === path)) return;
      const row = { requestId, path, url: response.url, status: response.status, phase }; report.runtimeBodies.push(row); bodyRequests.set(requestId, row);
    });
    cdp.on('Network.loadingFinished', ({ requestId }) => {
      const row = bodyRequests.get(requestId); if (!row) return;
      pendingBodies.push((async () => {
        const body = await bounded(cdp.send('Network.getResponseBody', { requestId }), 5_000, 'Runtime body'); const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'); row.bytes = bytes.length; row.sha256 = hash(bytes);
        const model = modelPins.find(m => m.path === row.path); assert.equal(new URL(row.url).origin, target.baseUrl); assert.equal(row.status, 200); assert.equal(row.sha256, model?.sha256 ?? bundles.get(row.path)); if (model) assert.equal(row.bytes, model.bytes);
      })().catch(error => { row.error = String(error); }));
    });
    page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
    page.on('console', message => { if (['error','warning'].includes(message.type())) report.console.push({ phase, type: message.type(), text: message.text() }); });
    page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    const canvas = page.locator('.scene-stage canvas');
    const mark = async name => { phase = name; await bounded(page.evaluate(name => { window.__r35DprMotion.mark(name, true); window.__r35DrainedKey.mark(name); }, name), limits.commandMs, 'Phase mark'); };
    const geometry = async () => {
      const row = await bounded(canvas.evaluate(element => { const r=element.getBoundingClientRect(), o=window.__r35DprMotion.snapshot(), d=o.dimensions.at(-1); return { nativeDpr:devicePixelRatio, viewport:{width:innerWidth,height:innerHeight}, canvas:{x:r.x,y:r.y,width:r.width,height:r.height}, buffer:{width:d?.width,height:d?.height}, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches }; }), limits.commandMs, 'Native geometry');
      const { reducedMotion, ...actual } = row; assert.equal(reducedMotion,false); assert.deepEqual(actual,expectedNativeGeometry); report.geometry.push({phase,...row}); return row;
    };
    const gate = async (name,keyIndex=null) => {
      try {
        const row=await waitForCleanGate({name,keyIndex,budgetMs:keyIndex===null?limits.initialGateMs:limits.keyGateMs,now:()=>performance.now(),
          readState:remaining=>bounded(page.evaluate(()=>window.__r35DrainedKey.status()),Math.min(limits.commandMs,remaining),'Gate status'),
          createCheckpoint:(name,remaining)=>bounded(page.evaluate(name=>{const api=window.__r35DrainedKey;return api.status().pendingObservedFrames?null:api.checkpoint(name);},name),Math.min(limits.commandMs,remaining),'Checkpoint creation'),
          pause:ms=>page.waitForTimeout(ms)});
        report.gates.push(row);await save();return row;
      }catch(error){if(error.gate)report.gates.push(error.gate);throw error;}
    };
    let cleanGate;
    await step('Load immutable scene, focus canvas and obtain initial checkpoint', async () => {
      await page.goto(target.baseUrl+'/configurator/premium',{waitUntil:'domcontentloaded'});
      await expect(page.getByRole('button',{name:'Ultimate Silver',exact:true})).toBeEnabled({timeout:limits.readinessMs});
      await expect(canvas).toHaveCount(1,{timeout:5_000});await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0,{timeout:5_000});
      await canvas.focus();await expect(canvas).toBeFocused();await mark('initial-gate');await geometry();cleanGate=await gate('initial');
    });
    for(let index=1;index<=limits.keys;index++)await step(`Native ArrowRight ${index} and clean completion checkpoint`,async()=>{
      await mark(`key-${index}`);
      await bounded(page.evaluate(({index,checkpointId})=>{const canvas=document.querySelector('.scene-stage canvas');if(document.activeElement!==canvas)throw new Error('Native key target lost focus');return window.__r35DrainedKey.armKey(index,checkpointId);},{index,checkpointId:cleanGate.checkpointId}),5_000,'Arm native key observation');
      const row={index,name:'ArrowRight',checkpointId:cleanGate.checkpointId,startedAt:performance.now(),result:'running'};report.inputs.push(row);
      try {await bounded(page.keyboard.press('ArrowRight'),limits.keyInputMs,'Native ArrowRight');row.result='completed';}
      catch(error){row.result='failed';row.error=String(error);throw error;}
      finally{row.elapsedMs=performance.now()-row.startedAt;}
      cleanGate=await gate(`key-${index}`,index);await geometry();
    });
    await step('One unchanged 45s composited screenshot after final clean prefix',async()=>{
      await mark('final-capture');const before=await geometry();
      const bounds=await canvas.boundingBox();assert(bounds);const overlays=await bounded(page.evaluate(observeOverlayRectangles),5_000,'DOM exclusions');
      const cleanBefore=await bounded(page.evaluate(checkpointId=>{const o=window.__r35DrainedKey.status(),cp=o.checkpoints.find(c=>c.id===checkpointId),c=o.contexts.find(c=>c.sceneCanvas);if(o.stopped||o.issues.length||!cp||cp.status!=='signaled'||cp.stale||c.workRevision!==cp.workRevision||o.pendingSyncs)throw new Error('Final checkpoint became stale before capture');return {checkpointId,workRevision:c.workRevision,actualDrawRafs:o.frames.length};},cleanGate.checkpointId),5_000,'Capture prefix validation');
      const row={startedAt:performance.now(),result:'running',before,cleanBefore};report.captures.push(row);await save();
      try {
        row.screenshotCallStartedAt=performance.now();
        const bytes=await page.screenshot({path:`${output}/after-three-native-keys.png`,timeout:45000,scale:'css',animations:'allow'});
        row.screenshotElapsedMs=performance.now()-row.screenshotCallStartedAt;row.after=await geometry();assert.deepEqual(row.after,before);assert.deepEqual(await canvas.boundingBox(),bounds);
        assert.deepEqual(await bounded(page.evaluate(observeOverlayRectangles),5_000,'DOM exclusions after capture'),overlays);
        const png=PNG.sync.read(bytes),mapped=mapCaptureGeometry({png,viewport:target.viewport,deviceScaleFactor:target.deviceScaleFactor,scale:'css',bounds,overlays});
        row.pixels=summarizeScenePixels(png,mapped.pixelBounds,mapped.overlays);row.scene=canvasPixelHash(bytes,mapped.pixelBounds,mapped.overlays);row.sha256=hash(bytes);row.pngWidth=png.width;row.pngHeight=png.height;
        assert(row.pixels.pixels>mapped.bounds.width*mapped.bounds.height/2&&row.scene.comparedPixels>mapped.bounds.width*mapped.bounds.height/2,'Original scene-pixel coverage required');assert.equal(row.pixels.blank,false,'Nonblank diagnostic image required');row.result='captured';
      }catch(error){row.result='failed';row.error=String(error);row.screenshotElapsedMs??=performance.now()-row.screenshotCallStartedAt;throw error;}
      finally{
        try {
          row.afterState=await bounded(page.evaluate(checkpointId=>{const o=window.__r35DrainedKey.status(),c=o.contexts.find(c=>c.sceneCanvas),cp=o.checkpoints.find(c=>c.id===checkpointId);return {workRevision:c?.workRevision,actualDrawRafs:o.frames.length,stopped:o.stopped,issues:o.issues,checkpointStatus:cp?.status,checkpointStale:cp?.stale};},cleanGate.checkpointId),5_000,'Post-capture prefix observation');
          row.prefixUnchangedDuringCapture=row.afterState.workRevision===cleanBefore.workRevision&&row.afterState.actualDrawRafs===cleanBefore.actualDrawRafs&&!row.afterState.stopped&&!row.afterState.issues.length&&!row.afterState.checkpointStale;
          if(!row.prefixUnchangedDuringCapture&&row.result==='captured'){row.result='failed';row.error='App prefix changed or health became invalid during capture';}
        }catch(error){row.postCaptureObservationError=String(error);if(row.result==='captured'){row.result='failed';row.error='Post-capture prefix observation unavailable';}}
        row.elapsedMs=performance.now()-row.startedAt;await save();
      }
      if(row.result!=='captured')throw new Error(row.error);
      await mark('finished');
    });
    report.result='observed';
  } catch(error) {report.result='failed';report.errors.push({phase,message:String(error),stack:error.stack});}
  finally {
    if(page)try{
      const data=await bounded(page.evaluate(()=>{window.__r35DrainedKey.stop('scenario-ended');return {observation:window.__r35DrainedKey.snapshot(),dimensions:window.__r35DprMotion.snapshot()};}),5_000,'Stop and collect frame observer');observerEvidence=data.observation;
      await bounded(writeFile(`${output}/drained-key-frames.json`,JSON.stringify(data.observation,null,2)),5_000,'Frame evidence write');
      await bounded(writeFile(`${output}/buffer-events.json`,JSON.stringify(data.dimensions,null,2)),5_000,'Dimension evidence write');
      report.assessment=assessDrainedKeyObservation(data.observation);report.keyPrefixes=classifyKeys(data.observation);
      if(report.gates.length!==4||report.gates.some(g=>g.status!=='clean'))report.assessment.failures.push('Four clean prefix gates required');
      if(report.captures.length!==1||report.captures[0].result!=='captured')report.assessment.failures.push('Single post-completion screenshot absent or incomplete');report.assessment.failures.push(...data.dimensions.issues);
      if(data.dimensions.events.some(e=>e.phase!=='setup'&&e.kind==='canvas-write'))report.assessment.failures.push('Stable phase changed native canvas buffer');
      if(data.dimensions.contexts.some(c=>c.lostEvents||c.restoredEvents))report.assessment.failures.push('Observed context lifecycle change');
      await bounded(Promise.all(pendingBodies),5_000,'Runtime identity completion');
      for(const path of ['/index.html',...modelPins.map(m=>m.path)])if(!report.runtimeBodies.some(r=>r.path===path&&r.sha256&&!r.error))report.assessment.failures.push(`Missing runtime identity: ${path}`);
      if(!report.runtimeBodies.some(r=>r.path.endsWith('.js')&&r.sha256&&!r.error)||report.runtimeBodies.some(r=>!r.sha256||r.error))report.assessment.failures.push('Runtime JavaScript/body identity incomplete');
      if(report.pageErrors.length||report.requestFailures.length||report.console.some(r=>r.type==='error'))report.assessment.failures.push('Unexpected page/browser/network error');
      if(report.assessment.failures.length){report.assessment.status='incomplete';report.result='failed';}
    }catch(error){report.result='failed';report.errors.push({phase:'evidence',message:String(error)});if(observerEvidence)await bounded(writeFile(`${output}/drained-key-last-snapshot.json`,JSON.stringify(observerEvidence,null,2)),5_000,'Last snapshot write').catch(()=>{});}
    for(const [name,action]of [['browser session detach',()=>browserCdp?.detach()],['browser close',()=>browser?.close()],['server close',()=>{if(server?.listening){server.closeAllConnections();return new Promise(done=>server.close(done));}}]])try{await bounded(Promise.resolve().then(action),limits.cleanupMs,name);}catch(error){report.result='failed';report.errors.push({phase:'cleanup',message:String(error)});}
    await save();
  }
  console.log(JSON.stringify({result:report.result,sourceCommit:report.sourceCommit,assessment:report.assessment,originalAcceptanceChanged:false},null,2));
  if(report.result!=='observed')process.exitCode=1;return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
