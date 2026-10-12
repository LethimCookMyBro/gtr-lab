/** CI-only capture of two ordinary production builds. No routing/substitution or timing qualification. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { summarizeScenePixels } from './dpr-motion-policy.mjs';
import { observeOverlayRectangles } from './environment-pixel-comparison.mjs';
import { collectDistAssets } from './raster-cost-evidence.mjs';
import { installFunctionalCaptureObserver, armFunctionalCapture, waitForFunctionalCapture, verifyFunctionalCapture } from './cabin-preparation-readiness.generated.mjs';
import { installPreparationObserver } from './cabin-preparation-observer.mjs';
import { installCabinResourceObserver } from './cabin-resource-observer.mjs';
import { cabinResourceCohort, assertCabinResourcesReleased } from './cabin-resource-assertions.mjs';
import { installDprMotionObserver } from './dpr-motion-observer.mjs';
import { installRenderBackpressureLifecycleFixture } from './render-backpressure-lifecycle-fixture.mjs';
import { assertFenceObservationHealthy, assertRetiredFenceContext } from './diagnose-render-backpressure-lifecycle.mjs';
import { captureActualComparisonCabinResponse, assertComparisonModelReceipt } from './cabin-leather-model-body.mjs';
import { createRuntimeBodyLedger } from './cabin-runtime-body-ledger.mjs';
import { boundedOperation, createCheckpointRecorder } from './cabin-preparation-checkpoint.mjs';
import { assertPreparationTimeline, assertResidentWorkUnchanged, assertRestoredExteriorPose, models } from './cabin-preparation-policy.mjs';
import { createCabinOracle } from './causal-cabin-model.mjs';
import { independentExteriorTransform } from './causal-motion-preflight.mjs';
import { budgets, readinessWindow, remainingBudget, sha256, contract, previewPath, validateComparisonEnvironment, verifyFilePins, assertPreviewSelection, inspectMaterialModel, assertNativeCertificate, helperPaths, buildPaths } from './cabin-leather-comparison-policy.mjs';

export async function main(env=process.env) {
  // Fail before loading a browser/server or opening any socket. Inputs are committed, not CLI overrides.
  const harness=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const request=JSON.parse(await readFile(resolve(harness,'qa/cabin-leather-comparison-request.json')));
  const target=validateComparisonEnvironment(env,request), root=resolve(process.argv[2]??'.');
  const output=resolve('cabin-leather-results',target.lane+'-'+target.name);await mkdir(output,{recursive:true});
  const report={result:'running',contract,requestSha256:sha256(JSON.stringify(request)),lane:target.lane,viewport:target.name,harnessCommit:env.GITHUB_SHA,sourceCommit:target.commit,source:null,model:target.expected.model,
    budgets,quality:'standard',settings:{name:target.name,viewport:target.viewport,deviceScaleFactor:target.deviceScaleFactor,isMobile:target.isMobile,hasTouch:target.hasTouch,reducedMotion:'no-preference',quality:'standard',maxBufferPixels:2000000,requestedAntialias:true,environment:'studio',lights:false,exposure:1},
    captures:[],steps:[],errors:[],pageErrors:[],console:[],runtimeBodies:[],cleanup:{},
    scope:'Actual production WebGL material-only comparison with native frame certificates and 11-image preparation/residency retirement. SwiftShader only; no performance or physical-device claim.'};
  const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
  let browser,context,server,page,ledger,nativeModel,cohort,checkpoint,owner,phase='initial';
  try {
    await verifyFilePins(harness,request.helperPins,helperPaths);await verifyFilePins(root,target.expected.buildFiles,buildPaths[target.lane]);
    report.source=await applicationIdentity(root);assert.deepEqual(report.source,target.expected.source);
    assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),target.commit);
    assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--','src','index.html','package.json','package-lock.json','vite.config.ts','server.mjs',...Object.keys(target.expected.buildFiles)],{encoding:'utf8'}).trim(),'');
    assertPreviewSelection(await readFile(resolve(root,previewPath),'utf8'),target,request);
    const assets=await collectDistAssets(resolve(root,'dist'));
    const intendedBytes=new Map(await Promise.all([...assets.keys()].map(async p=>[p,(await stat(resolve(root,'dist'+p))).size])));
    const model=await readFile(resolve(root,'dist'+target.expected.model.path)), gzip=await readFile(resolve(root,'dist'+target.expected.model.path+'.gz'));
    assert.equal(gzip.length,target.expected.model.gzipBytes);assert.equal(sha256(gzip),target.expected.model.gzipSha256);assert.equal(gunzipSync(gzip,{maxOutputLength:target.expected.model.bytes}).equals(model),true);
    const original=gunzipSync(await readFile(resolve(root,'qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz')),{maxOutputLength:request.baseline.model.bytes});
    report.material=inspectMaterialModel(model,target.expected.model,target.lane,original);
    const exterior=await readFile(resolve(root,'dist'+models[1].path));assert.equal(sha256(exterior),models[1].sha256);
    const proxy=await readFile(resolve(root,'dist'+models[2].path));assert.equal(sha256(proxy),models[2].sha256);
    const transform=independentExteriorTransform(exterior),oracle=createCabinOracle(transform);
    report.assets=Object.fromEntries(assets);report.transform=transform;await save();
    const require=createRequire(resolve(root,'package.json'));const {chromium,expect}=require('@playwright/test');
    const {PNG}=require('playwright-core/lib/utilsBundle');
    const {createAppServer}=await import(pathToFileURL(resolve(root,'server.mjs')));
    server=createAppServer(resolve(root,'dist'));await new Promise((done,reject)=>{server.once('error',reject);server.listen(4178,'127.0.0.1',done);});
    browser=await chromium.launch({timeout:30000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
    context=await browser.newContext({viewport:target.viewport,deviceScaleFactor:target.deviceScaleFactor,isMobile:target.isMobile,hasTouch:target.hasTouch,reducedMotion:'no-preference',serviceWorkers:'block'});
    await context.addInitScript({content:`(${installCabinResourceObserver.toString()})(${JSON.stringify({expectedImages:report.material.images})});(${installDprMotionObserver.toString()})({maxRecords:32768,observeContextCreation:true});(${installRenderBackpressureLifecycleFixture.toString()})();(${installFunctionalCaptureObserver.toString()})();(${installPreparationObserver.toString()})(${JSON.stringify({modelPath:target.expected.model.path,modelJson:model.subarray(20,20+model.readUInt32LE(12)).toString('utf8')})});`});
    page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
    const cdp=await context.newCDPSession(page);nativeModel=await captureActualComparisonCabinResponse({cdp,model:target.expected.model,baseUrl:target.baseUrl,phase:()=>phase});
    ledger=createRuntimeBodyLedger({intendedAssets:assets,intendedBytes});checkpoint=createCheckpointRecorder({row:report,save:async()=>{report.runtimeBodyLedger=ledger.snapshot();await save();}});
    const ids=new WeakMap(),generations=new WeakMap();let nextId=0,generation=0;
    const id=r=>{if(!ids.has(r))ids.set(r,++nextId);return ids.get(r);};
    const observeError=error=>{report.errors.push(String(error));};
    page.on('request',r=>{try{const url=new URL(r.url());if(url.protocol==='blob:'&&url.origin===target.baseUrl)return;assert.equal(url.origin,target.baseUrl);if(r.isNavigationRequest()&&r.frame()===page.mainFrame())ledger.beginDocument(++generation);generations.set(r,generation);report.runtimeBodies.push(ledger.issue({requestId:id(r),generation,url:r.url(),path:url.pathname.startsWith('/configurator/')?'/index.html':url.pathname,phase,startedAt:r.timing().startTime}));if(url.pathname===target.expected.model.path)nativeModel.bindRequest({requestId:id(r),generation,url:r.url(),method:r.method()});}catch(e){observeError(e);}});
    page.on('response',r=>{try{const url=new URL(r.url());if(url.protocol==='blob:'&&url.origin===target.baseUrl)return;assert.equal(url.origin,target.baseUrl);ledger.receive({requestId:id(r.request()),generation:generations.get(r.request()),url:r.url(),status:r.status(),body:()=>url.pathname===target.expected.model.path?nativeModel.readBody({requestId:id(r.request()),generation:generations.get(r.request()),url:r.url(),status:r.status()}):r.body()});}catch(e){observeError(e);}});
    page.on('requestfailed',r=>{try{ledger.fail({requestId:id(r),generation:generations.get(r),error:r.failure()?.errorText});}catch(e){observeError(e);}});
    page.on('pageerror',e=>report.pageErrors.push(String(e)));
    page.on('console',m=>{if(['warning','error'].includes(m.type()))report.console.push({type:m.type(),text:m.text(),location:m.location()});});
    const canvas=page.locator('.scene-stage canvas'),dialog=page.getByRole('dialog');
    const snap=window=>boundedOperation(window,'preparation snapshot',()=>page.evaluate(()=>globalThis.__r35Preparation.snapshot()));
    const resources=async window=>{await boundedOperation(window,'settle image identities',()=>page.evaluate(()=>globalThis.__cabinResourceObserver.settleIdentities()));return boundedOperation(window,'resource snapshot',()=>page.evaluate(()=>globalThis.__cabinResourceObserver.snapshot()));};
    const tap=(locator,window)=>boundedOperation(window,'trusted input',()=>target.hasTouch?locator.tap({timeout:remainingBudget(window)}):locator.click({timeout:remainingBudget(window)}));
    const open=async(label,window)=>{await tap(page.getByRole('button',{name:label,exact:true}),window);await boundedOperation(window,'drawer terminal animation',()=>page.waitForFunction(()=>{const layer=document.querySelector('.drawer-layer'),drawer=document.querySelector('.drawer');return drawer?.dataset.phase==='open'&&layer?.getAnimations({subtree:true}).every(a=>['finished','idle'].includes(a.playState));},null,{timeout:remainingBudget(window),polling:16}));};
    const capture=async(label,seat,window)=>{
      phase=label;assert.ok(report.captures.length<5);
      await boundedOperation(window,'native frame readiness',()=>waitForFunctionalCapture(page,{preset:'hero',timeout:remainingBudget(window),quality:'standard'}));
      const bounds=await canvas.boundingBox();assert.ok(bounds&&bounds.width>200&&bounds.height>150);
      const renderer=await canvas.evaluate(el=>{const gl=el.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),antialias:gl.getContextAttributes().antialias,samples:gl.getParameter(gl.SAMPLES),sampleBuffers:gl.getParameter(gl.SAMPLE_BUFFERS)};});
      assert.match(renderer.renderer,/SwiftShader/i);assert.equal(renderer.antialias,true);assert.ok(renderer.samples>=2&&renderer.sampleBuffers>=1);
      const overlays=await page.evaluate(observeOverlayRectangles);const rail=page.locator('footer[aria-label="Cabin preview controls"]');if(await rail.count())overlays.push({name:'cabin-rail',...await rail.boundingBox()});
      const file=label+'.png',shotWindow=readinessWindow(budgets.screenshot);
      const png=await checkpoint(label+'.screenshot',shotWindow,()=>page.screenshot({path:resolve(output,file),timeout:remainingBudget(shotWindow),scale:'css'}));
      const certificate=await boundedOperation(shotWindow,'verify unchanged native certificate',()=>verifyFunctionalCapture(page));
      assert.ok(certificate.readyAt-certificate.armedAt<=window.budget);assert.deepEqual(await canvas.boundingBox(),bounds);
      const observation=await snap(shotWindow);assertNativeCertificate(certificate,observation,target,seat);
      if(seat){oracle.reset(seat);const d=certificate.snapshot.dimensions;assert.ok(oracle.compare(certificate.snapshot,d.renderWidth,d.renderHeight),'Independent exact seat pose/projection');}
      const decoded=PNG.sync.read(png);assert.equal(decoded.width,target.viewport.width);assert.equal(decoded.height,target.viewport.height);
      const pixels=summarizeScenePixels(decoded,bounds,overlays);assert.equal(pixels.blank,false);
      const row={label,file,seat,pixels,sha256:sha256(png),bytes:png.length,png:{width:decoded.width,height:decoded.height},bounds,renderer,certificate,readinessWindow:window,screenshotWindow:shotWindow};report.captures.push(row);await save();return row;
    };
    const initialWindow=readinessWindow(budgets.initial);
    await checkpoint('initial.navigate',initialWindow,()=>page.goto(target.baseUrl+'/configurator/premium',{waitUntil:'domcontentloaded',timeout:remainingBudget(initialWindow)}));
    await checkpoint('initial.ready',initialWindow,()=>page.waitForFunction(()=>globalThis.__r35Preparation?.status().ui.preparation?.phase==='ready',null,{timeout:remainingBudget(initialWindow),polling:50}));
    const initial=await capture('initial',null,initialWindow);owner=initial.certificate.owner;
    oracle.reset('driver');const d=initial.certificate.snapshot.dimensions;
    assertPreparationTimeline(await snap(readinessWindow(15000)),initial.certificate,{quality:'standard',nativeDpr:target.deviceScaleFactor,driverPose:oracle.expected(d.renderWidth,d.renderHeight).pose});
    cohort=cabinResourceCohort({sequence:0},await resources(readinessWindow(budgets.lifecycle)),report.material.images);
    assert.equal(cohort.bitmapIds.length,11);assert.deepEqual(cohort.decodedButNotUploaded,[]);assert.deepEqual([...cohort.uploadedImageNames].sort(),report.material.images.map(i=>i.name).sort());report.residentCohort=cohort;
    const initialWork=(await snap(readinessWindow(15000))).totals;assert.equal(initialWork.fetches,1);assert.equal(initialWork.gltfParses,1);
    const enter=async label=>{await open('Camera',readinessWindow(15000));const window=readinessWindow(budgets.functional);await armFunctionalCapture(page);await tap(dialog.getByRole('button',{name:'Interior',exact:true}),window);await boundedOperation(window,'camera drawer closes',()=>expect(dialog).toHaveCount(0,{timeout:remainingBudget(window)}));const row=await capture(label,'driver',window);const observed=await snap(readinessWindow(15000)),click=observed.clicks.findLast(c=>c.label==='Interior');assert.ok(click?.trusted);assert.equal(row.certificate.owner,owner);assert.ok(row.certificate.mainDrawId>click.mainBefore);assertResidentWorkUnchanged(initialWork,observed.totals);return row;};
    await enter('driver');
    const passengerWindow=readinessWindow(budgets.functional);await armFunctionalCapture(page);await tap(page.getByRole('button',{name:'Passenger',exact:true}),passengerWindow);await capture('passenger','passenger',passengerWindow);
    const exitWindow=readinessWindow(budgets.functional);await armFunctionalCapture(page);await tap(page.getByRole('button',{name:'Back to exterior',exact:true}),exitWindow);const restored=await capture('exterior-restored',null,exitWindow);assertRestoredExteriorPose(restored.certificate.snapshot.pose,initial.certificate.snapshot.pose);
    await enter('driver-repeat');assert.deepEqual(cabinResourceCohort({sequence:0},await resources(readinessWindow(budgets.lifecycle)),report.material.images),cohort);
    const retireWindow=readinessWindow(budgets.lifecycle);await open('Switch model',retireWindow);await tap(dialog.getByRole('button',{name:/^NISMO /}),retireWindow);await boundedOperation(retireWindow,'retired route acknowledgement',()=>expect(page).toHaveURL(/\/configurator\/nismo$/,{timeout:remainingBudget(retireWindow)}));await boundedOperation(retireWindow,'retired canvas',()=>expect(canvas).toHaveCount(0,{timeout:remainingBudget(retireWindow)}));
    await checkpoint('eleven-images-retired',retireWindow,()=>expect.poll(async()=>{try{assertCabinResourcesReleased(cohort,await resources(retireWindow));return true;}catch{return false;}},{timeout:remainingBudget(retireWindow)}).toBe(true));
    report.resources=await resources(retireWindow);report.resourceRetirement=assertCabinResourcesReleased(cohort,report.resources);
    report.observation=await snap(retireWindow);const native=report.observation.contexts.find(c=>c.owner===owner);assert.ok(native&&!native.connected);
    for(const resource of report.observation.resources.filter(r=>r.contextId===native.id)){assert.equal(resource.deleted,1);assert.equal(resource.deletedLive,true);}
    report.fixture=await page.evaluate(()=>globalThis.__r35RenderBackpressureLifecycle.snapshot());assertFenceObservationHealthy(report.fixture);const fenceContext=report.fixture.contexts.filter(c=>c.sceneOwner)[0];assert.ok(fenceContext);assertRetiredFenceContext(report.fixture,fenceContext.id);
    report.dpr=await page.evaluate(()=>globalThis.__r35DprMotion.snapshot());assert.deepEqual(report.dpr.issues,[]);
    const sceneContexts=report.dpr.contexts.filter(c=>c.sceneCanvas);assert.equal(sceneContexts.length,1);for(const c of sceneContexts){assert.equal(c.creation.contextType,'webgl2');assert.equal(c.creation.requestedAntialias,true);assert.equal(c.creation.antialias,true);assert.ok(c.creation.samples>=2&&c.creation.sampleBuffers>=1);}
    assert.deepEqual(report.observation.issues,[]);report.result='collected';
  }catch(error){report.result='failed';report.errors.push({message:String(error),stack:error.stack});}
  finally{
    const cleanupWindow=readinessWindow(budgets.lifecycle);
    if(ledger){try{report.runtimeBodyLedger=await boundedOperation(cleanupWindow,'runtime body drain',()=>ledger.finish({window:cleanupWindow}));const rows=report.runtimeBodyLedger.requests;for(const required of ['/index.html',target.expected.model.path,models[1].path])assert.ok(rows.some(r=>r.path===required&&r.state==='body-completed'));assert.equal(rows.filter(r=>r.path===target.expected.model.path).length,1);assert.ok(rows.some(r=>r.path.endsWith('.js')));assert.deepEqual(report.runtimeBodyLedger.errors,[]);report.cleanup.receipts='passed';}catch(e){report.errors.push(String(e));report.result='failed';}}
    if(context)try{await boundedOperation(cleanupWindow,'close browser context',()=>context.close());report.cleanup.context='closed';}catch(e){report.errors.push(String(e));report.result='failed';}
    if(browser)try{await boundedOperation(cleanupWindow,'close browser',()=>browser.close());report.cleanup.browser='closed';}catch(e){report.errors.push(String(e));report.result='failed';}
    if(server)try{await boundedOperation(cleanupWindow,'close production server',()=>new Promise((done,reject)=>server.close(e=>e?reject(e):done())));report.cleanup.server='closed';}catch(e){report.errors.push(String(e));report.result='failed';}
    // Persist actual final drain/failure state even when ledger.finish rejected.
    if(ledger)report.runtimeBodyLedger=ledger.snapshot();
    if(nativeModel){report.nativeModelReceipt=nativeModel.snapshot();try{assertComparisonModelReceipt(report.nativeModelReceipt,target.expected.model,report.runtimeBodyLedger?.requests??[]);}catch(error){report.errors.push(String(error));report.result='failed';}}
    if(report.result==='collected'&&report.errors.length===0&&report.pageErrors.length===0&&report.console.length===0)report.result='passed';else report.result='failed';
    await save();
  }
  assert.equal(report.result,'passed','Exact lane evidence must be complete');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
