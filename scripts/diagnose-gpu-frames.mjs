/** Private source-pinned fence observation. This is never screenshot acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { validateGpuFrameEnvironment, assessGpuFrames, isQuietAndDrained, gpuModels, limits } from './gpu-frame-policy.mjs';
import { installGpuFrameObserver } from './gpu-frame-observer.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
export async function main(env = process.env) {
  const target = validateGpuFrameEnvironment(env); // Before browser/app/helper imports or setup.
  const root = resolve(env.R35_GPU_FRAME_APP_ROOT ?? '.'), harness = dirname(fileURLToPath(import.meta.url));
  const { applicationIdentity } = await import(pathToFileURL(resolve(harness, 'diagnose-dpr-motion.mjs')));
  const source = await applicationIdentity(root);
  assert.equal(source.sha256, env.R35_GPU_FRAME_SOURCE_TREE, 'Exact reviewed application bytes required');
  assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), env.R35_GPU_FRAME_SOURCE_SHA);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs'], { encoding: 'utf8' }).trim(), '', 'Candidate production bytes must remain clean');
  const { featureLaunchOptions, validateActualArguments, expectedNativeGeometry } = await import(pathToFileURL(resolve(harness, 'screenshot-feature-policy.mjs')));
  const { launchFeatureBrowser } = await import(pathToFileURL(resolve(harness, 'diagnose-screenshot-feature.mjs')));
  const { installDprMotionObserver } = await import(pathToFileURL(resolve(harness, 'dpr-motion-observer.mjs')));
  const bundles = new Map([['/index.html', hash(await readFile(resolve(root, 'dist/index.html')))]]);
  for (const name of await readdir(resolve(root, 'dist/assets'))) if (/\.(?:js|css)$/.test(name)) bundles.set(`/assets/${name}`, hash(await readFile(resolve(root, 'dist/assets', name))));
  for (const model of gpuModels) { const bytes = await readFile(resolve(root, 'dist' + model.path)); assert.equal(bytes.length, model.bytes); assert.equal(hash(bytes), model.sha256); }
  const output = resolve('gpu-frame-results/desktop'); await mkdir(output, { recursive: true });
  const report = { scope: 'Instrumented WebGL2 completion observation only', originalAcceptanceChanged: false, result: 'running', sourceCommit: env.R35_GPU_FRAME_SOURCE_SHA, sourceTree: source.sha256, harnessCommit: env.GITHUB_SHA,
    reducedMotion: 'no-preference', viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, limits, featureMode: 'default', explicitJavascriptFlush: false,
    limitations: ['No PNGs are requested; original full normal-motion acceptance remains failed/incomplete.', 'Pending counts are unobserved completion counts, not known GPU queue depth.', 'No explicit JavaScript flush is called, but pinned Chromium query polling and ANGLE fence creation can internally flush/submit work. The instrumentation is not a passive scheduling control.', 'Pinned ANGLE Vulkan may use global-EGL fence scope and include other earlier context work. Completion proves earlier app commands complete, not app-only GPU execution time.', 'Observable signal brackets include task-gated caching, command-buffer scheduling, polling delay and measurement overhead. SwiftShader results are not hardware FPS.', 'A naturally drained entry removes earlier tracked app-command backlog only. It cannot exclude compositor contention or later browser resolve/export work.'],
    steps: [], inputs: [], drains: [], runtimeBodies: [], pageErrors: [], console: [], requestFailures: [], errors: [], geometry: [] };
  const save = () => bounded(writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)), 5_000, 'Report write');
  await writeFile(`${output}/identity.json`, JSON.stringify({ source, sourceCommit: report.sourceCommit, harnessCommit: report.harnessCommit, bundles: Object.fromEntries(bundles), models: gpuModels }, null, 2)); await save();
  const { chromium, expect } = await import('@playwright/test');
  const { createAppServer } = await import(pathToFileURL(resolve(root, 'server.mjs')));
  const require = createRequire(import.meta.url); assert.equal(require('playwright-core/package.json').version, '1.63.0');
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
    await context.addInitScript({ content: `(${installDprMotionObserver.toString()})({maxRecords:8192});(${installGpuFrameObserver.toString()})({windowMs:${limits.observerMs}});` });
    page = await context.newPage(); page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(45_000);
    const cdp = await context.newCDPSession(page);
    await bounded(cdp.send('Network.enable', { maxResourceBufferSize: 64*1024*1024, maxTotalBufferSize: 256*1024*1024 }), 5_000, 'Network identity observation');
    await bounded(cdp.send('Network.setCacheDisabled', { cacheDisabled: true }), 5_000, 'Disable cache');
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      const url = new URL(response.url), path = url.pathname === '/configurator/premium' ? '/index.html' : url.pathname;
      if (!bundles.has(path) && !gpuModels.some(m => m.path === path)) return;
      const row = { requestId, path, url: response.url, status: response.status, phase }; report.runtimeBodies.push(row); bodyRequests.set(requestId, row);
    });
    cdp.on('Network.loadingFinished', ({ requestId }) => {
      const row = bodyRequests.get(requestId); if (!row) return;
      pendingBodies.push((async () => {
        const body = await bounded(cdp.send('Network.getResponseBody', { requestId }), 5_000, 'Runtime body'); const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'); row.bytes = bytes.length; row.sha256 = hash(bytes);
        const model = gpuModels.find(m => m.path === row.path); assert.equal(new URL(row.url).origin, target.baseUrl); assert.equal(row.status, 200); assert.equal(row.sha256, model?.sha256 ?? bundles.get(row.path)); if (model) assert.equal(row.bytes, model.bytes);
      })().catch(error => { row.error = String(error); }));
    });
    page.on('pageerror', error => report.pageErrors.push({ phase, message: error.message }));
    page.on('console', message => { if (['error','warning'].includes(message.type())) report.console.push({ phase, type: message.type(), text: message.text() }); });
    page.on('requestfailed', request => report.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    const canvas = page.locator('.scene-stage canvas');
    const snapshot = async () => bounded(page.evaluate(() => ({ now: performance.now(), observation: window.__r35GpuFrames.snapshot() })), limits.commandMs, 'Completion snapshot');
    const mark = async name => { phase = name; await bounded(page.evaluate(name => { window.__r35DprMotion.mark(name, true); window.__r35GpuFrames.mark(name); }, name), limits.commandMs, 'Phase mark'); };
    const geometry = async () => {
      const row = await bounded(canvas.evaluate(element => { const r=element.getBoundingClientRect(), o=window.__r35DprMotion.snapshot(), d=o.dimensions.at(-1); return { nativeDpr:devicePixelRatio, viewport:{width:innerWidth,height:innerHeight}, canvas:{x:r.x,y:r.y,width:r.width,height:r.height}, buffer:{width:d?.width,height:d?.height}, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches }; }), limits.commandMs, 'Native geometry');
      const { reducedMotion, ...actual } = row; assert.equal(reducedMotion,false); assert.deepEqual(actual,expectedNativeGeometry); report.geometry.push({phase,...row});
    };
    const drain = async (name, budgetMs) => {
      const row={name,budgetMs,startedAt:performance.now(),result:'waiting',snapshots:0};report.drains.push(row);
      const until=row.startedAt+budgetMs;
      while(performance.now()<until){const {now,observation}=await snapshot();row.snapshots++;observerEvidence=observation;row.pendingObservedFrames=observation.pendingObservedFrames;
        if(observation.stopped)throw new Error(`Observer stopped during ${name}: ${observation.stopReason}`);
        if(isQuietAndDrained(observation,now)){row.result='naturally-quiet-and-drained';row.elapsedMs=performance.now()-row.startedAt;await save();return true;}
        await page.waitForTimeout(Math.min(250,Math.max(1,until-performance.now())));
      }
      row.result='bounded-inconclusive';row.elapsedMs=performance.now()-row.startedAt;await save();return false;
    };
    await step('Load immutable exterior and observe natural completion', async () => {
      await page.goto(target.baseUrl+'/configurator/premium',{waitUntil:'domcontentloaded'});
      await expect(page.getByRole('button',{name:'Ultimate Silver',exact:true})).toBeEnabled({timeout:limits.readinessMs});
      await expect(canvas).toHaveCount(1,{timeout:5_000});await expect(page.locator('.scene-loading, .scene-notice, .render-error')).toHaveCount(0,{timeout:5_000});
      await canvas.focus(); await mark('initial-idle'); await geometry();
      report.initialDrained = await drain('initial-idle',limits.initialDrainMs);
    });
    await step('One native keyboard orbit from a naturally drained entry when available', async () => {
      if(!report.initialDrained){report.isolatedInput='skipped: no natural prior-app-work-complete baseline';return;}
      await mark('isolated-key-input'); const startedAt=performance.now(); await bounded(page.keyboard.press('ArrowRight'),5_000,'One native keyboard input');report.inputs.push({name:'ArrowRight',startedAt,elapsedMs:performance.now()-startedAt,result:'completed'});
      await mark('isolated-key-settle');report.isolatedDrained=await drain('isolated-key-settle',limits.isolatedDrainMs);await geometry();
    });
    await step('Native pointer orbit then bounded completion observation', async () => {
      await mark('orbit-input');
      const p=await bounded(canvas.evaluate(element=>{const r=element.getBoundingClientRect();for(const y of [.45,.55,.35,.65])for(const x of [.5,.35,.65]){const p={x:r.x+r.width*x,y:r.y+r.height*y};if(document.elementFromPoint(p.x,p.y)===element)return p;}throw new Error('No unobscured pointer target');}),5_000,'Pointer target');
      const inputDeadline=performance.now()+limits.orbitInputMs;
      const input=async(name,action)=>{const remaining=inputDeadline-performance.now();assert(remaining>0,'Native input total budget exceeded');const row={name,startedAt:performance.now()};report.inputs.push(row);try{await bounded(action(),Math.min(15_000,remaining),name);row.result='completed';}catch(error){row.result='failed';row.error=String(error);throw error;}finally{row.elapsedMs=performance.now()-row.startedAt;}};
      await input('move-to-canvas',()=>page.mouse.move(p.x,p.y));
      try { await input('pointer-down',()=>page.mouse.down()); for(let i=1;i<=12;i++){await input(`move-${i}`,()=>page.mouse.move(p.x+i*4,p.y+Math.sin(i/3)*8));await page.waitForTimeout(75);} }
      finally {const startedAt=performance.now();try{await bounded(page.mouse.up(),5_000,'Pointer release cleanup');report.inputs.push({name:'pointer-up',startedAt,result:'completed',elapsedMs:performance.now()-startedAt});}catch(error){report.inputs.push({name:'pointer-up',startedAt,result:'failed',error:String(error)});throw error;}}
      await mark('orbit-settle');report.orbitDrained=await drain('orbit-settle',limits.orbitDrainMs);await geometry();await mark('finished');
    });
    report.result='observed';
  } catch(error) {report.result='failed';report.errors.push({phase,message:String(error),stack:error.stack});}
  finally {
    if(page)try{
      const data=await bounded(page.evaluate(()=>{window.__r35GpuFrames.stop('scenario-ended');return {observation:window.__r35GpuFrames.snapshot(),dimensions:window.__r35DprMotion.snapshot()};}),5_000,'Stop and collect frame observer');observerEvidence=data.observation;
      await bounded(writeFile(`${output}/gpu-frames.json`,JSON.stringify(data.observation,null,2)),5_000,'Frame evidence write');
      await bounded(writeFile(`${output}/buffer-events.json`,JSON.stringify(data.dimensions,null,2)),5_000,'Dimension evidence write');
      report.assessment=assessGpuFrames(data.observation);report.assessment.failures.push(...data.dimensions.issues);
      if(data.dimensions.events.some(e=>e.phase!=='setup'&&e.kind==='canvas-write'))report.assessment.failures.push('Stable phase changed native canvas buffer');
      if(data.dimensions.contexts.some(c=>c.lostEvents||c.restoredEvents))report.assessment.failures.push('Observed context lifecycle change');
      await bounded(Promise.all(pendingBodies),5_000,'Runtime identity completion');
      for(const path of ['/index.html',...gpuModels.map(m=>m.path)])if(!report.runtimeBodies.some(r=>r.path===path&&r.sha256&&!r.error))report.assessment.failures.push(`Missing runtime identity: ${path}`);
      if(!report.runtimeBodies.some(r=>r.path.endsWith('.js')&&r.sha256&&!r.error)||report.runtimeBodies.some(r=>!r.sha256||r.error))report.assessment.failures.push('Runtime JavaScript/body identity incomplete');
      if(report.pageErrors.length||report.requestFailures.length||report.console.some(r=>r.type==='error'))report.assessment.failures.push('Unexpected page/browser/network error');
      if(report.assessment.failures.length){report.assessment.status='incomplete';report.result='failed';}
    }catch(error){report.result='failed';report.errors.push({phase:'evidence',message:String(error)});if(observerEvidence)await bounded(writeFile(`${output}/gpu-frames-last-snapshot.json`,JSON.stringify(observerEvidence,null,2)),5_000,'Last snapshot write').catch(()=>{});}
    for(const [name,action]of [['browser session detach',()=>browserCdp?.detach()],['browser close',()=>browser?.close()],['server close',()=>{if(server?.listening){server.closeAllConnections();return new Promise(done=>server.close(done));}}]])try{await bounded(Promise.resolve().then(action),limits.cleanupMs,name);}catch(error){report.result='failed';report.errors.push({phase:'cleanup',message:String(error)});}
    await save();
  }
  console.log(JSON.stringify({result:report.result,sourceCommit:report.sourceCommit,assessment:report.assessment,originalAcceptanceChanged:false},null,2));
  if(report.result!=='observed')process.exitCode=1;return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
