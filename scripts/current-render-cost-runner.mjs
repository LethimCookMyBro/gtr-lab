import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { expectedRequest, authorizeRun, validateRequest, verifySources, deriveReadiness, expectedDimensions, actionPrefix, censor, hash, modelPins, completePlan, summarizeInterval } from './current-render-cost-policy.mjs';
import { installCurrentRenderCostObserver } from './current-render-cost-observer.mjs';
const here=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function runBoundedPrefix(plan,execute,readFailure,persist) {
 let rows=plan.map(step=>({...step,status:'planned'}));await persist(rows);
 for(let i=0;i<rows.length;i++){
  rows[i].status='running';await persist(rows);
  try{Object.assign(rows[i],await execute(plan[i]));rows[i].status='passed';}
  catch(error){let raw;try{raw=await readFailure();}catch(readError){raw={unavailable:String(readError)};}rows=censor(rows,i,{error:String(error),raw});await persist(rows);break;}
  await persist(rows);
 }return rows;
}
export { summarizeInterval } from './current-render-cost-policy.mjs';
export async function cleanupResources({persist,browser,server}) {
 const result={confirmed:false,browserClosed:!browser,serverClosed:!server,errors:[]};
 try{await persist();}catch(error){result.errors.push({step:'pre-cleanup-persistence',error:String(error)});}
 finally{
  try{await browser?.close();result.browserClosed=true;}
  catch(error){result.errors.push({step:'browser-close',error:String(error)});}
  finally{
   try{if(server?.listening){server.closeAllConnections();await new Promise((done,reject)=>server.close(error=>error?reject(error):done()));}result.serverClosed=true;}
   catch(error){result.errors.push({step:'server-close',error:String(error)});}
  }
 }
 result.confirmed=result.browserClosed&&result.serverClosed&&result.errors.length===0;return result;
}
export async function main(env=process.env,{checkOnly=false}={}) {
 const request=JSON.parse(await readFile(resolve(here,'qa/current-render-cost-request.json'),'utf8'));
 if(checkOnly){validateRequest({...request,allow:false});return verifySources(resolve(env.R35_APP_ROOT??resolve(here,'../gtr-resume-20261013/app')));}
 // This gate precedes source traversal, generated files, dynamic runtime imports and any sockets.
 const target=authorizeRun(request,env);
 const app=resolve(env.R35_APP_ROOT),source=await verifySources(app),output=resolve(here,'results',target.cell);
 const importApp=name=>import(pathToFileURL(resolve(app,name)));
 const {collectDistAssets,runnerIdentity}=await importApp('scripts/raster-cost-evidence.mjs');
 const assets=await collectDistAssets(resolve(app,'dist'));
 const {createRuntimeBodyLedger}=await importApp('scripts/cabin-runtime-body-ledger.mjs');
 const {readinessWindow}=await importApp('scripts/cabin-preparation-policy.mjs');
 const intendedBytes=new Map();for(const path of assets.keys())intendedBytes.set(path,(await stat(resolve(app,'dist'+path))).size);
 const ledger=createRuntimeBodyLedger({intendedAssets:assets,intendedBytes});ledger.beginDocument(1);
 for(const model of modelPins){const bytes=await readFile(resolve(app,'dist'+model.path));assert.equal(bytes.length,model.bytes);assert.equal(hash(bytes),model.sha256);}
 await mkdir(output,{recursive:true});const generated=deriveReadiness(await readFile(resolve(app,'scripts/functional-capture-readiness.mjs')));
 await writeFile(resolve(output,'readiness.generated.mjs'),generated);
 const readiness=await import(pathToFileURL(resolve(output,'readiness.generated.mjs')));
 const {environmentCaptureReady,readFunctionalCaptureFailure}=await importApp('scripts/vehicle-preview-readiness.mjs');
 const {canvasPixelHash,assertDistinctScenePixels,observeOverlayRectangles}=await importApp('scripts/environment-pixel-comparison.mjs');
 const {summarizeScenePixels}=await importApp('scripts/dpr-motion-policy.mjs');
 const require=createRequire(resolve(app,'package.json')),{PNG}=require('playwright-core/lib/utilsBundle');
 const {chromium,expect}=await import(pathToFileURL(require.resolve('@playwright/test')));
 const {createAppServer}=await importApp('server.mjs');
 const report={version:1,contract:request.contract,cell:target.cell,sourceTree:source.source.sha256,sourceCommit:source.sourceCommit,harnessCommit:env.GITHUB_SHA,request,source,models:modelPins,
  status:'running',runner:runnerIdentity(env),runtimeBodies:[],derivedBlobs:[],steps:[],errors:[],pageErrors:[],warnings:[],requestsFailed:[],
  limits:{functionalMs:15000,availabilityMs:90000,captureMs:45000,retries:0},
  scope:'Current source four-cell SwiftShader discriminator. The 45s capture cap is stricter than historical 1920 visual 90s. This run cannot replace that historical verdict or native-motion acceptance.',
  limitations:['No hardware GPU runner or hardware FPS claim.','Exact scheduler admission and pre-main start are not emitted; earlier delay remains partly unpartitioned.','Cached shadow/environment work is not assumed to execute on every frame.','No repaint, extra fence/poll, retry or default quality downgrade.','Stopped suffix rows remain blocked; no cherry-picked successful denominator.']};
 const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
 let server,browser,page,canvas,initialCanvas,expectedPreset='hero',expectedEnvironment='studio',quality='standard',captureArmed=true,intervalStart=0;
 const images=new Map(),requestIds=new WeakMap();let nextRequestId=0,activeStep='setup';
 const mark=(phase,data={})=>page.evaluate(({phase,data})=>globalThis.__r35CurrentRenderCost.mark(phase,data),{phase,data});
 const observe=()=>page.evaluate(()=>globalThis.__r35CurrentRenderCost.snapshot());
 const failure=async()=>{const observation=await observe();return {functional:await readFunctionalCaptureFailure(page),observation,gate:report.activeGate??null,interval:summarizeInterval(observation,intervalStart,report.activeGate?.deadline??Infinity)};};
 try{
  server=createAppServer(resolve(app,'dist'));await new Promise((done,reject)=>{server.once('error',reject);server.listen(4178,'127.0.0.1',done);});
  const base='http://127.0.0.1:4178';
  const args=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'];
  browser=await chromium.launch({timeout:30000,args});report.browser={version:browser.version(),args};
  const context=await browser.newContext({viewport:request.viewport,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript({content:`(${readiness.installFunctionalCaptureObserver.toString()})();(${installCurrentRenderCostObserver.toString()})();`});
  page=await context.newPage();page.setDefaultTimeout(15_000);page.setDefaultNavigationTimeout(30_000);
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  page.on('request',request=>{
   try{const url=new URL(request.url());assert.equal(url.origin,base,'Unexpected runtime origin');if(url.protocol==='blob:')return;
    const requestId=++nextRequestId;requestIds.set(request,requestId);const path=url.pathname.startsWith('/configurator/')?'/index.html':url.pathname;
    const receipt=ledger.issue({requestId,generation:1,url:request.url(),path,phase:activeStep,startedAt:performance.now()});report.runtimeBodies.push(receipt);
   }catch(error){report.errors.push({step:activeStep,error:String(error)});}
  });
  page.on('response',response=>{
   try{const url=new URL(response.url());assert.equal(url.origin,base,'Unexpected runtime origin');if(url.protocol==='blob:'){report.derivedBlobs.push({step:activeStep,url:response.url(),status:response.status()});return;}
    ledger.receive({requestId:requestIds.get(response.request()),generation:1,url:response.url(),status:response.status(),body:()=>response.body()});
   }catch(error){report.errors.push({step:activeStep,error:String(error)});}
  });
  page.on('pageerror',error=>report.pageErrors.push({step:activeStep,message:error.message}));
  page.on('console',message=>{if(message.type()==='error')report.pageErrors.push({step:activeStep,message:message.text()});else if(message.type()==='warning')report.warnings.push({step:activeStep,message:message.text()});});
  page.on('requestfailed',r=>{const error=r.failure()?.errorText??'Unknown request failure';report.requestsFailed.push({step:activeStep,url:r.url(),error});try{if(requestIds.has(r))ledger.fail({requestId:requestIds.get(r),generation:1,error});}catch(failure){report.errors.push({step:activeStep,error:String(failure)});}});
  canvas=page.locator('.scene-stage canvas');const dialog=page.getByRole('dialog');
  const arm=async options=>{await mark('arm',{step:activeStep,options:options??{}});await readiness.armFunctionalCapture(page,options);captureArmed=true;};
  const settled=async()=>{
   await expect(canvas).toHaveCount(1);await expect(page.getByRole('button',{name:'Ultimate Silver',exact:true})).toBeEnabled({timeout: 90_000});
   if(!captureArmed)await arm({allowUnchanged:true});
   const start=await mark('gate-start',{step:activeStep,timeout:15000});report.activeGate={step:activeStep,startAt:start.at,configuredMs:15000};await save();
   await readiness.waitForFunctionalCapture({evaluate:(...a)=>page.evaluate(...a),waitForFunction:(_predicate,functional,options)=>{
    report.activeGate.deadline=functional.deadline;
    return page.waitForFunction(environmentCaptureReady,{environment:expectedEnvironment,functional},options);
   }},{preset:expectedPreset,timeout: 15_000,quality});
   const certificate=await page.evaluate(()=>globalThis.__gtrFunctionalCapture.snapshot().certificate);
   assert.deepEqual({width:certificate.snapshot.dimensions.width,height:certificate.snapshot.dimensions.height,pixelRatio:certificate.snapshot.dimensions.pixelRatio},expectedDimensions({...certificate.snapshot.dimensions,nativeDpr:1},quality));
   await mark('gate-completed',{step:activeStep,certificate:{owner:certificate.owner,mainDrawId:certificate.mainDrawId,fenceId:certificate.fenceId,drainFenceId:certificate.drainFenceId,deadline:certificate.deadline,readyAt:certificate.readyAt}});
   return certificate;
  };
  const capture=async id=>{
   const certificate=await settled();assert.equal(await canvas.evaluate((element,first)=>element===first,initialCanvas),true);
   await canvas.focus();await page.mouse.move(1918,1078);
   const bounds=await canvas.boundingBox();assert.ok(bounds&&bounds.width>200&&bounds.height>200);
   assert.ok(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth)<=1);
   const overlays=await page.evaluate(observeOverlayRectangles),before=await observe();
   const screenshotStart=await mark('capture-start',{step:activeStep});
   const png=await page.screenshot({path:resolve(output,`${id}.png`),animations:'disabled',scale:'css',timeout: 45_000});
   const verified=await readiness.verifyFunctionalCapture(page);captureArmed=false;
   const screenshotEnd=await mark('capture-end',{step:activeStep});
   assert.deepEqual(await canvas.boundingBox(),bounds);assert.deepEqual(await page.evaluate(observeOverlayRectangles),overlays);
   const pixels=summarizeScenePixels(PNG.sync.read(png),bounds,overlays);assert.equal(pixels.blank,false);
   const comparison=canvasPixelHash(png,bounds,overlays),image={canvasSha256:comparison.sha256,comparisonLayout:comparison.layout};images.set(id,image);
   const distinct=(ids,message)=>assertDistinctScenePixels(ids.map(key=>images.get(key)),message);
   if(id==='low')distinct(['low','hero'],'Low orbit changed actual visible pixels');
   if(['home-reset','zoom-reset'].includes(id))assert.deepEqual(image,images.get('hero'),'Home restores exact canonical pixels');
   if(id.startsWith('orbit-')){const n=Number(id.split('-')[1]);distinct([id,n===1?'hero':`orbit-${n-1}`],'Every orbit checkpoint changes actual visible pixels');}
   if(id==='zoom-min-clamped')assert.deepEqual(image,images.get('zoom-min'),'Minimum zoom clamps');
   if(id==='zoom-max-clamped')assert.deepEqual(image,images.get('zoom-max'),'Maximum zoom clamps');
   if(id==='zoom-max')distinct(['zoom-min','zoom-max'],'Zoom endpoints differ');
   const interval=summarizeInterval(before,intervalStart,certificate.deadline);intervalStart=screenshotEnd.sequence;
   const {dimensions,live,...state}=verified.snapshot;
   return {measurementKind:verified.reusedUnchanged&&interval.workload.draws===0?'unchanged-completed-baseline':'new-native-completion',certificate:verified,state,dimensions,workload:interval.workload,interval,pixels,comparison,pngSha256:hash(png),captureElapsedMs:screenshotEnd.at-screenshotStart.at};
  };
  const execute=async step=>{
   activeStep=step.id;if(step.type!=='initial')await mark('step',{id:step.id});
   if(step.type==='initial'){
    await page.goto(base+'/configurator/premium',{waitUntil:'domcontentloaded',timeout:30000});await expect(page).toHaveTitle(/GT-R LAB/);await settled();initialCanvas=await canvas.elementHandle();assert.ok(initialCanvas);
    report.backend=await canvas.evaluate(element=>{const gl=element.getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:gl.getParameter(extension?extension.UNMASKED_RENDERER_WEBGL:gl.RENDERER),antialias:gl.getContextAttributes().antialias,samples:gl.getParameter(gl.SAMPLES),sampleBuffers:gl.getParameter(gl.SAMPLE_BUFFERS),defaultFramebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,nativeDpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight}};});
    assert.match(report.backend.renderer,/SwiftShader/);assert.equal(report.backend.antialias,true);assert.ok(report.backend.samples>=2);assert.ok(report.backend.sampleBuffers>=1);assert.equal(report.backend.nativeDpr,1);assert.deepEqual(report.backend.viewport,request.viewport);return {certificate:await settled()};
   }
   if(step.type==='accessibility'){
    await expect(canvas).toHaveAttribute('tabindex','0');await expect(canvas).toHaveAttribute('role','application');await expect(canvas).toHaveAccessibleName(/Interactive vehicle/);await expect(canvas).toHaveAttribute('aria-keyshortcuts',/ArrowLeft.*ArrowRight.*Home/);
    await canvas.focus();await expect(canvas).toBeFocused();await page.keyboard.press('Tab');await expect(canvas).not.toBeFocused();const trigger=page.getByRole('button',{name:'Environment',exact:true});await trigger.focus();await trigger.press('Enter');await expect(dialog).toBeFocused();
    const choices=dialog.locator('.environment-choices button');await expect(choices).toHaveCount(5);for(const [id,label]of [['studio','Pit garage'],['gallery','Gallery'],['night','After hours'],['forest','Test paddock'],['coast','Coastal road']]){const option=choices.filter({has:page.locator(`.environment-preview.${id}`)});await expect(option).toHaveAccessibleName(new RegExp(`^${label}(?:\\s|$)`));await expect(option).toBeEnabled();}
    await page.keyboard.press('Shift+Tab');await expect(choices.last()).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Close panel',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();return {};
   }
   if(step.type==='quality'){
    await page.getByRole('button',{name:'Environment',exact:true}).click();const radio=dialog.locator(`input[name="render-quality"][value="${target.quality}"]`);await expect(radio).toBeEnabled();await arm({allowUnchanged:true});const start=await mark('quality-input',{value:target.quality});await radio.click();await expect(radio).toBeChecked();quality=target.quality;
    await dialog.getByRole('button',{name:'Close panel',exact:true}).click();await expect(dialog).toHaveCount(0);const certificate=await settled();const observation=await observe();const selected=observation.events.filter(e=>e.sequence>start.sequence&&e.kind==='input'&&e.type==='click'&&e.trusted&&e.target.name==='render-quality'&&e.target.value===quality);assert.equal(selected.length,1,'Actual trusted selection required in both cells');intervalStart=(await mark('quality-ready')).sequence;return {certificate,selection:selected[0]};
   }
   if(step.type==='environment'){
    const trigger=page.getByRole('button',{name:'Environment',exact:true});await trigger.click();await expect(dialog).toHaveAttribute('aria-modal','true');const option=dialog.locator('.environment-choices button').filter({has:page.locator(`.environment-preview.${target.environment}`)});await expect(option).toHaveCount(1);await expect(option).toBeEnabled();await expect(option).toHaveAccessibleName(new RegExp(`^${target.environment==='studio'?'Pit garage':'After hours'}(?:\\s|$)`));await arm();expectedEnvironment=target.environment;await option.click();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expect(page.locator('main.configurator')).toHaveClass(new RegExp(`(?:^|\\s)environment-${target.environment}(?:\\s|$)`));const certificate=await settled();await trigger.press('Enter');await expect(option).toHaveClass(/(?:^|\s)selected(?:\s|$)/);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();return {certificate};
   }
   if(step.type==='camera'){
    await arm({cameraRequest:true});expectedPreset=({'Front ¾':'hero',Front:'front',Rear:'rear',Side:'side','Top detail':'top'})[step.label];await page.getByRole('button',{name:'Camera',exact:true}).click();await dialog.getByRole('button',{name:step.label,exact:true}).click();await expect(dialog).toHaveCount(0);return {certificate:await settled()};
   }
   if(step.type==='key'){
    await arm({allowUnchanged:['+','-'].includes(step.key)});await canvas.focus();const shifted=step.key.startsWith('Shift+'),key=shifted?step.key.slice(6):step.key;if(shifted)await page.keyboard.down('Shift');
    try{await page.keyboard.down(key);await Promise.all(Array.from({length:step.count-1},()=>page.keyboard.down(key)));}finally{await page.keyboard.up(key);if(shifted)await page.keyboard.up('Shift');}return {};
   }
   if(step.type==='gate')return {certificate:await settled()};
   if(step.type==='capture')return capture(step.id);
   throw Error('Unknown exact prefix step');
  };
  report.steps=await runBoundedPrefix(completePlan(target.cell),execute,failure,async rows=>{report.steps=rows;await save();});
  report.observation=await observe();report.finalFunctional=await readFunctionalCaptureFailure(page);
  report.status=report.steps.every(s=>s.status==='passed')?'collected':'failed';
 }catch(error){report.status='failed';report.errors.push({step:activeStep,error:String(error)});if(page)try{report.finalFailure=await failure();}catch{}}
 finally{
  try{await ledger.finish({window:readinessWindow(15000)});}catch(error){report.status='failed';report.errors.push({step:'bounded-body-drain',error:String(error)});}
  report.bodyLedger=ledger.snapshot();report.modelBodies=report.runtimeBodies.filter(r=>r.path.endsWith('.glb'));
  if(report.bodyLedger.state!=='finished'||report.bodyLedger.errors.length||report.errors.length||report.runtimeBodies.some(r=>r.error)||report.pageErrors.length||report.requestsFailed.length||report.observation?.issues.length){report.status='failed';report.errors.push({step:'evidence-health',error:'Runtime body, browser or observation error; see raw receipts'});}
  report.cleanup=await cleanupResources({persist:save,browser,server});report.cleanupConfirmed=report.cleanup.confirmed;report.errors.push(...report.cleanup.errors);if(!report.cleanupConfirmed)report.status='failed';
  report.bodyLedger=ledger.snapshot();if(report.bodyLedger.state!=='finished'||report.bodyLedger.errors.length||report.errors.length||report.requestsFailed.length)report.status='failed';
  if(report.status==='collected')report.status='passed';await save();
 }
 if(report.status!=='passed')process.exitCode=1;return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await main(process.env,{checkOnly:process.argv.includes('--check')});console.log(JSON.stringify(process.argv.includes('--check')?{sourceCommit:result.sourceCommit,sourceTree:result.source.sha256,request:'disabled'}:{cell:result.cell,status:result.status},null,2));
}
