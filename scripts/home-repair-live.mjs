/** Read-only, candidate-only production verification. No server or held requests. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {bounded,verifyCheckout,exercise,createHomeShot,homeSnapshot} from './home-repair-browser.mjs';
import {budgets,distIdentity,model,audio,formulaPhoto} from './home-repair-policy.mjs';
import {createUiReceipts} from './ui-optimization-receipts.mjs';
import {installHomeRepairGpuObserver} from './home-repair-gpu-observer.mjs';
import {installHomeRepairAudioObserver} from './home-repair-audio-observer.mjs';
import {liveOrigin,liveContract,liveReleaseMarker,expectedLiveRequest,validateLiveRequest,validateLiveMarker,assertLiveRevision} from './home-repair-live-policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:budgets.command}).trim();
export async function verifyLiveCheckout(env=process.env) {
  validateLiveRequest(expectedLiveRequest,env); // Closed before file traversal, browser imports or sockets.
  assert.equal(resolve('.'),root,'Exact release checkout only');
  const request=JSON.parse(await readFile(resolve(root,'qa/home-repair-live-request.json'),'utf8')),target=validateLiveRequest(request,env);
  const marker=JSON.parse(await readFile(resolve(root,liveReleaseMarker),'utf8'));validateLiveMarker(marker,request);
  const staged=JSON.parse(await readFile(resolve(root,'qa/home-repair-request.json'),'utf8'));assert.equal(staged.allow,false,'Staged lane must be inactive at release');
  const identity=await verifyCheckout(root,'candidate',{candidateTree:request.sourceTree,candidateInputs:request.inputTree},env);
  const revision={commit:identity.commit,message:git(['log','-1','--format=%B']),changedFiles:git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n')};
  git(['merge-base','--is-ancestor',request.stagedCommit,'HEAD']);revision.stagedIsAncestor=true;assertLiveRevision(revision,request,env);
  return {target,request,marker,identity,revision};
}
export async function naturalStartup({page,row,check,initialStarted}) {
  await check('natural-decoded-poster-and-menu',async()=>{
    const deadline=initialStarted+budgets.initialPage,left=()=>{const value=deadline-performance.now();assert.ok(value>0,'Original single25000ms natural startup deadline');return value;};
    row.initialWindow={startedAt:initialStarted,deadline,budget:budgets.initialPage,scope:'Natural production navigation. No held-request or car-pending causal proof.'};
    await page.waitForFunction(()=>document.querySelector('.home-film--hero')?.getAttribute('data-film-poster')==='decoded'&&document.querySelector('.home-loading-gate')?.getAttribute('data-state')==='resolved'&&!document.querySelector('.home-loading-gate')?.hasAttribute('open'),null,{timeout:left()});
    row.audioBeforeAnyGesture=await bounded(page.evaluate(()=>globalThis.__r35HomeAudio.snapshot()),Math.min(budgets.command,left()),'Natural initial audio observation');assert.equal(row.audioBeforeAnyGesture.events.some(event=>event.kind==='start'),false);
    row.naturalStartup=await bounded(page.evaluate(homeSnapshot),Math.min(budgets.command,left()),'Natural startup DOM');assert.equal(row.naturalStartup.inert,false);
    await page.getByRole('button',{name:'Open menu',exact:true}).click({timeout:Math.min(budgets.command,left())});await page.locator('.home-menu-dialog').waitFor({state:'visible',timeout:Math.min(budgets.command,left())});
    row.naturalNavigation={menuOpened:true,elapsedMs:performance.now()-initialStarted};left();
    await bounded(page.keyboard.press('Escape'),Math.min(budgets.command,left()),'Natural menu Escape');await page.locator('.home-menu-dialog').waitFor({state:'hidden',timeout:Math.min(budgets.command,left())});
  });
}
export async function main(env=process.env) {
  const verified=await verifyLiveCheckout(env);if(process.argv.includes('--check-release')){process.stdout.write(JSON.stringify(verified,null,2)+'\n');return;}
  const {target}=verified,output=resolve(root,'home-repair-live-results',target.name);await mkdir(output,{recursive:true});
  const row={contract:liveContract,lane:'candidate',mode:'live',...verified,status:'running',startedAt:new Date().toISOString(),checks:[],captures:[],errors:[],pageErrors:[],console:[],providerResponses:[],runtimeBodies:[],limitations:[
    'Candidate-only deployed evidence; no baseline comparison or held-request startup proof.',
    'Provider HTTP failures and unverified native playback remain explicit. Iframe load is not first-frame proof.',
    'Nonblank image-content checks require visual review; they do not certify provider playback.',
    'Native hidden policy remains partial when runner focus cannot hide the page. SwiftShader/CSS viewports are not physical-device approval.',
    'Supplementary320 and short-landscape captures certify control reachability and native resize, not full-car composition.',
  ]};
  const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(row,null,2));await save();
  const deadline=performance.now()+budgets.lane;let expired=false,browser,context,page,receipts;
  const alive=()=>{assert.equal(expired,false);assert.ok(performance.now()<deadline,'Original300s live lane deadline');};
  const check=async(name,run)=>{alive();const item={name,status:'running',startedAt:new Date().toISOString()};row.checks.push(item);await save();try{await run();item.status='passed';}catch(error){item.status='failed';item.error=String(error);row.errors.push({check:name,message:String(error)});}finally{item.finishedAt=new Date().toISOString();await save();}};
  try {
    await bounded((async()=>{
      row.dist=await distIdentity(root);const pins=new Map(row.dist.files.map(file=>['/'+file.path.slice('dist/'.length),{bytes:file.bytes,sha256:file.sha256}]));
      assert.deepEqual(pins.get(model.path),{bytes:model.bytes,sha256:model.sha256});assert.equal(pins.get(audio.path)?.sha256,audio.sha256);assert.equal(pins.get(formulaPhoto.path)?.sha256,formulaPhoto.sha256);
      const posterReference=JSON.parse(await readFile(resolve(root,'qa/home-repair-pixel-fixtures/reference.json'),'utf8'));assert.equal(pins.get('/media/campaign-r35-orange-hero.webp')?.sha256,posterReference.sourceSha256);
      const {verifyReleaseAssets}=await import('./verify-release-assets.mjs');
      row.publicPreflight=await verifyReleaseAssets({directory:resolve(root,'dist'),commit:env.GITHUB_SHA,fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(budgets.body)])})});await save();
      // Separate public preflight receipts never substitute any browser body.
      const {chromium}=await import('@playwright/test'),{PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
      browser=await chromium.launch({timeout:budgets.nativeLater,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
      context=await browser.newContext({viewport:target.viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block',...(target.name==='mobile'?{isMobile:true,hasTouch:true}:{})});
      await context.addInitScript(installHomeRepairGpuObserver,{windowMs:budgets.lane});await context.addInitScript(installHomeRepairAudioObserver);
      page=await context.newPage();page.setDefaultTimeout(budgets.command);page.setDefaultNavigationTimeout(budgets.initialPage);
      page.on('pageerror',error=>row.pageErrors.push(String(error)));page.on('console',message=>{if(['error','warning'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
      page.on('response',response=>{if(new URL(response.url()).hostname==='media.flixel.com'&&row.providerResponses.length<100)row.providerResponses.push({url:response.url(),status:response.status(),resourceType:response.request().resourceType()});});
      receipts=createUiReceipts({page,origin:liveOrigin,pins,receipts:row.runtimeBodies});
      const shot=createHomeShot({getPage:()=>page,row,target,deadline,alive,output,save,PNG,posterReference,lane:'candidate'}),initialStarted=performance.now();
      await bounded(receipts.navigate(liveOrigin+'/'),budgets.initialPage,'Natural initial navigation');
      await exercise({page,context,row,shot,check,save,receipts,target,initialStarted,startup:()=>naturalStartup({page,row,check,initialStarted})});
      await receipts.finish();row.runtimeLedger=receipts.snapshot();
      for(const path of ['/index.html',model.path,audio.path,formulaPhoto.path])assert.ok(row.runtimeBodies.some(receipt=>receipt.path===path&&receipt.state==='body-completed'),`Original live response required: ${path}`);
      for(const extension of ['.js','.css'])assert.ok(row.runtimeBodies.some(receipt=>receipt.path.endsWith(extension)&&receipt.state==='body-completed'));
      assert.deepEqual(row.pageErrors,[]);row.status=row.errors.length?'failed':'passed';
    })(),Math.max(1,deadline-performance.now()),'Entire live lane');
  }catch(error){row.status='failed';row.errors.push({message:String(error),stack:error.stack});}
  finally {
    expired=true;if(receipts){row.runtimeLedger=receipts.snapshot();receipts.stop();}
    if(page&&!page.isClosed())try{row.finalObservation=await bounded(page.evaluate(()=>{const gpu=globalThis.__r35HomeGpuFrames?.snapshot(),audio=globalThis.__r35HomeAudio?.snapshot();globalThis.__r35HomeGpuFrames?.stop('live-lane-ended');globalThis.__r35HomeAudio?.stop();return {gpu,audio};}),budgets.command,'Final live native observation');}catch(error){row.errors.push({message:String(error)});row.status='failed';}
    for(const [label,cleanup] of [['Browser context cleanup',()=>context?.close()],['Browser cleanup',()=>browser?.close()]])try{await bounded(Promise.resolve(cleanup()),budgets.cleanup,label);}catch(error){row.status='failed';row.errors.push({message:String(error)});}
    row.finishedAt=new Date().toISOString();await save();
  }
  assert.equal(row.status,'passed','Exact deployed homepage candidate acceptance');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
