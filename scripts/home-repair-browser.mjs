/** Fresh reconstructed source/asset/body-bound CI evidence, not a recovered lost artifact.
 * Never imports a server/browser before closed CI preflight. Provider traffic is untouched. */
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {assessHeroPixels,observeHeroPixelGeometry,assessDetailPixels,observeDetailPixelGeometry,detailPoster} from './home-repair-pixels.mjs';
import {createUiReceipts} from './ui-optimization-receipts.mjs';
import {installHomeRepairGpuObserver} from './home-repair-gpu-observer.mjs';
import {installHomeRepairAudioObserver} from './home-repair-audio-observer.mjs';
import {contract,baselineCommit,budgets,sourceIdentity,inputIdentity,distIdentity,sha256,validateRequest,model,audio,formulaPhoto,assessAudio,assessGate,supplementaryViewports} from './home-repair-policy.mjs';
const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:budgets.command}).trim();
export async function verifyCheckout(root,lane,request,env) {
  const commit=git(root,['rev-parse','HEAD']);assert.equal(commit,lane==='baseline'?baselineCommit:env.GITHUB_SHA);
  assert.equal(git(root,['status','--porcelain','--untracked-files=no']),'','Full tracked checkout must be clean');
  const source=await sourceIdentity(root),inputs=await inputIdentity(root);
  assert.equal(source.sha256,request[`${lane}Tree`],`${lane} exact reviewed production source`);assert.equal(inputs.sha256,request[`${lane}Inputs`],`${lane} exact reviewed asset/preparation inputs`);
  return {commit,gitTree:git(root,['rev-parse','HEAD^{tree}']),fullTrackedCheckoutClean:true,source,inputs};
}
export async function preflight(env=process.env,root=resolve('.')) {
  const request=JSON.parse(await readFile(resolve(root,'qa/home-repair-request.json'),'utf8'));const target=validateRequest(request,env);
  const identities={};for(const lane of ['baseline','candidate'])identities[lane]=await verifyCheckout(lane==='baseline'?resolve(root,'../baseline-app'):root,lane,request,env);
  return {request,target,identities};
}
export async function bounded(promise,ms,label) {let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}: original ${ms}ms deadline exceeded`)),ms);})]);}finally{clearTimeout(timer);}}
export function homeSnapshot(carHeld=false) {
  const gate=document.querySelector('.home-loading-gate'),hero=document.querySelector('.home-film--hero'),image=hero?.querySelector('img'),root=document.querySelector('.cinematic-home');
  const rect=element=>{if(!element)return null;const box=element.getBoundingClientRect();return Object.fromEntries(['x','y','width','height','bottom','right'].map(key=>[key,box[key]]));};
  return {at:performance.now(),viewport:{width:innerWidth,height:innerHeight},y:scrollY,overflow:document.documentElement.scrollWidth>innerWidth+1,visibility:document.visibilityState,
    gate:gate?.getAttribute('data-state'),gateOpen:gate?.hasAttribute('open')??false,inert:root?.hasAttribute('inert')??true,poster:hero?.getAttribute('data-film-poster'),posterNaturalWidth:image?.naturalWidth??0,posterOpacity:image?getComputedStyle(image).opacity:null,heroRect:rect(hero),headlineRect:rect(document.querySelector('h1')),
    carHeld,scene:document.querySelector('.home-signature-runway')?.getAttribute('data-scene-state'),phase:document.querySelector('.home-signature-runway')?.getAttribute('data-load-phase'),loadingFilmHeadline:[...document.querySelectorAll('.home-film-entry')].some(node=>/Loading film/i.test(node.textContent??'')),
    films:[...document.querySelectorAll('.home-film')].map(node=>({kind:node.className,state:node.getAttribute('data-film-state'),document:node.getAttribute('data-film-document'),playback:node.getAttribute('data-film-playback'),poster:node.getAttribute('data-film-poster'),iframes:node.querySelectorAll('iframe').length,rect:rect(node)})),
    sound:[...document.querySelectorAll('.r35-sound-preview, .r35-section-sound')].map(node=>({className:node.className,phase:node.getAttribute('data-audio-phase'),rect:rect(node),controls:[...node.querySelectorAll('button')].map(button=>({label:button.textContent?.trim(),rect:rect(button),disabled:button.disabled}))}))};
}
export async function nativeSeek(page,target,limit=budgets.nativeLater,now=()=>performance.now()) {
  const deadline=now()+limit;await page.mouse.move(8,8);
  while(now()<deadline){
    const position=await bounded(page.evaluate(()=>({y:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight)})),budgets.command,'Native scroll position');
    const reachable=Math.min(position.max,Math.max(0,target)),delta=reachable-position.y;
    if(Math.abs(delta)<2)return {requestedTarget:target,reachableTarget:reachable,maxScrollY:position.max,actualY:position.y,clamped:reachable!==target};
    await bounded(page.mouse.wheel(0,Math.sign(delta)*Math.min(1200,Math.abs(delta))),budgets.command,'Native wheel');await page.waitForTimeout(80);
  }
  throw new Error(`Native scroll did not reach target within original ${limit}ms deadline`);
}
export async function sectionTarget(page,selector,progress=.5) {return page.locator(selector).evaluate((element,p)=>{
  const rect=element.getBoundingClientRect(),child=element.firstElementChild;
  // Only a real sticky runway has scroll progress. Ordinary sections align at
  // their start; nativeSeek records the browser's reachable document clamp.
  const sticky=child&&getComputedStyle(child).position==='sticky';
  return scrollY+rect.top+(sticky?Math.max(0,rect.height-child.getBoundingClientRect().height)*p:0);
},progress);}
export async function waitForAudioProof({before,read,pause,now=()=>performance.now()}) {
  // Assess in Node: the page receives only a directly serialized snapshot read,
  // never source text for eval under the application's unchanged strict CSP.
  const startedAt=now(),deadline=startedAt+budgets.initialPage;let samples=0;
  while(now()<deadline){
    const playing=await bounded(read(),Math.min(budgets.command,deadline-now()),'Native audio snapshot');samples++;
    assert.ok(now()<deadline,'Original 25000ms audio proof deadline exceeded after snapshot');
    const proof=assessAudio(before,playing);
    if(proof.passed)return {playing,proof,window:{startedAt,deadline,budget:budgets.initialPage,samples}};
    const remaining=deadline-now();if(remaining>0)await pause(Math.min(100,remaining));
  }
  throw new Error('Original 25000ms audio proof deadline exceeded');
}
export function observeRouteExit() {
  const home=document.querySelector('.cinematic-home'),menu=document.querySelector('.home-menu-dialog'),canvas=document.querySelector('.home-signature-runway canvas'),link=document.querySelector('.home-menu-primary a[href="/models"]');
  const style=element=>{if(!element)return null;const css=getComputedStyle(element),box=element.getBoundingClientRect();return {connected:element.isConnected,clipPath:css.clipPath,opacity:css.opacity,transform:css.transform,pointerEvents:css.pointerEvents,rect:{x:box.x,y:box.y,width:box.width,height:box.height},animations:element.getAnimations().map(animation=>{const timing=animation.effect?.getComputedTiming();return {playState:animation.playState,currentTime:animation.currentTime,playbackRate:animation.playbackRate,timing:timing&&{delay:timing.delay,duration:timing.duration,progress:timing.progress,endTime:timing.endTime,localTime:timing.localTime}};})};};
  const box=link?.getBoundingClientRect(),hit=box?document.elementFromPoint(box.x+box.width/2,box.y+box.height/2):null;
  return {pathname:location.pathname,documentReadyState:document.readyState,menuOpen:menu?.hasAttribute('open')??false,homeConnected:home?.isConnected??false,canvasConnected:canvas?.isConnected??false,menu:style(menu),link:style(link),linkCenterHit:hit&&{tag:hit.tagName,id:hit.id,className:hit.className,belongsToLink:hit===link||link.contains(hit)},nativeOwners:(globalThis.__r35HomeGpuFrames?.snapshot().contexts??[]).map(({id,sceneCanvas,connected})=>({id,sceneCanvas,connected}))};
}
export async function observeRouteAction({receipt,action,read,pause,now=()=>performance.now()}) {
  const startedAt=now(),deadline=startedAt+budgets.command;Object.assign(receipt,{startedAt,deadline,budget:budgets.command,status:'running',samples:0});let outcome;
  const pending=action(budgets.command).then(()=>{outcome={};},error=>{outcome={error};});
  try {
    while(!outcome&&now()<deadline){
      const sample=await bounded(Promise.race([pending.then(()=>null),read().then(value=>({value}))]),Math.max(1,deadline-now()),'Native route action observation');
      if(sample&&now()<deadline){receipt.last=sample.value;receipt.lastAt=now();receipt.samples++;}
      if(!outcome&&now()<deadline)await bounded(Promise.race([pending,pause(Math.min(100,deadline-now()))]),Math.max(1,deadline-now()),'Native route action interval');
    }
    assert.ok(outcome,'Original 5000ms route action deadline exceeded');if(outcome.error)throw outcome.error;assert.ok(now()<=deadline,'Original 5000ms route action deadline exceeded after return');receipt.status='returned';
  }catch(error){receipt.status='failed';receipt.error=String(error);throw error;}
  finally{receipt.finishedAt=now();receipt.elapsedMs=receipt.finishedAt-startedAt;}
}
export async function waitForRouteExit({receipt,read,pause,now=()=>performance.now()}) {
  const startedAt=now(),deadline=startedAt+budgets.command;Object.assign(receipt,{startedAt,deadline,budget:budgets.command,status:'waiting',samples:0});
  try {
    while(now()<deadline){
      const sample=await bounded(read(),deadline-now(),'Native route observation');
      assert.ok(now()<deadline,'Original 5000ms route deadline exceeded after snapshot');
      receipt.last=sample;receipt.lastAt=now();receipt.samples++;
      if(receipt.last.pathname==='/models'){receipt.status='passed';return receipt.last;}
      const remaining=deadline-now();if(remaining>0)await pause(Math.min(100,remaining));
    }
    throw new Error('Original 5000ms route deadline exceeded');
  }catch(error){receipt.status='failed';receipt.error=String(error);throw error;}
  finally{receipt.finishedAt=now();receipt.elapsedMs=receipt.finishedAt-startedAt;}
}
export async function waitForDetailPoster({page,now=()=>performance.now()}) {
  const startedAt=now(),deadline=startedAt+budgets.command,left=()=>{const remaining=deadline-now();assert.ok(remaining>0,'Original5000ms detail transition deadline');return remaining;};
  await page.waitForFunction(()=>{const film=document.querySelector('.home-film--detail'),image=film?.querySelector('.home-film-backup');return document.querySelectorAll('.home-film--hero iframe').length===0&&film?.getAttribute('data-film-poster')==='decoded'&&image?.complete&&image.naturalWidth>0;},null,{timeout:left()});
  const decoded=await bounded(page.evaluate(async()=>{const image=document.querySelector('.home-film--detail .home-film-backup');if(!image)throw new Error('Detail image missing');await image.decode();return {sameImage:image===document.querySelector('.home-film--detail .home-film-backup'),connected:image.isConnected,source:image.currentSrc,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};}),left(),'Actual local detail decode');
  left();assert.ok(decoded.sameImage&&decoded.connected&&decoded.naturalWidth>0&&decoded.naturalHeight>0);assert.equal(new URL(decoded.source).pathname,detailPoster.path);
  return {decoded,window:{startedAt,deadline,budget:budgets.command,elapsedMs:now()-startedAt},scope:'Same real local image decoded after natural scroll; provider playback remains unverified.'};
}
async function sampleProviderPair(page) {
  const before={at:Date.now(),frames:[]},after={at:null,frames:[]},owned=[];
  const read=video=>({currentTime:video.currentTime,readyState:video.readyState,paused:video.paused,duration:Number.isFinite(video.duration)?video.duration:null,videoWidth:video.videoWidth,videoHeight:video.videoHeight,connected:video.isConnected&&video.ownerDocument===document});
  for(const [frameId,frame] of page.frames().filter(frame=>frame!==page.mainFrame()).entries()) {
    const row={frameId,url:frame.url(),videos:[]};before.frames.push(row);
    try {
      const documentHandle=await bounded(frame.evaluateHandle(()=>document),budgets.command,'Provider document identity');
      const handles=await bounded(frame.locator('video').elementHandles(),budgets.command,'Provider video identities');
      for(const [videoId,handle] of handles.entries())row.videos.push({videoId,...await bounded(handle.evaluate(read),budgets.command,'Provider native video sample')});
      owned.push({frameId,frame,documentHandle,handles});
    }catch(error){row.error=String(error);}
  }
  await page.waitForTimeout(800);after.at=Date.now();
  let playback={status:'blocked-or-unverified',firstFrame:'unverified',reason:'No verified same-document/same-video native media clock advancement'};
  for(const owner of owned){const row={frameId:owner.frameId,url:owner.frame.url(),videos:[]};after.frames.push(row);try{
    row.sameDocument=await bounded(owner.documentHandle.evaluate(saved=>saved===document),budgets.command,'Provider same-document proof');
    for(const [videoId,handle] of owner.handles.entries()){
      const current={videoId,...await bounded(handle.evaluate(read),budgets.command,'Provider same-video sample')};row.videos.push(current);
      const prior=before.frames.find(frame=>frame.frameId===owner.frameId)?.videos.find(video=>video.videoId===videoId);
      if(row.sameDocument&&current.connected&&prior?.connected&&current.currentTime>prior.currentTime+.05&&current.readyState>=2)playback={status:'native-media-clock-advanced',firstFrame:'unverified',frameId:owner.frameId,videoId,before:prior,after:current,reason:'Same native document/video handle. Media-clock movement does not prove compositor presentation'};
    }
  }catch(error){row.error=String(error);}finally{await Promise.allSettled([...owner.handles,owner.documentHandle].map(handle=>handle.dispose()));}}
  return {before,after,playback,scope:'Read-only native DOM handles retain actual provider document/video identity. No provider response, method or event is replaced.'};
}
export function rearCertificate(state,canvas,progress) {
  if(state.issues.length)throw new Error(state.issues.join('; '));
  const contexts=state.contexts.filter(context=>context.sceneCanvas&&context.connected);if(contexts.length!==1)return null;
  const context=contexts[0],frameDrain=state.frames.find(frame=>frame.id===context.lastFenceId);
  const checkpoint=state.checkpoints?.findLast(cp=>cp.contextId===context.id&&cp.status==='signaled'&&!cp.stale&&cp.workRevision===context.workRevision);
  const drain=checkpoint??frameDrain,main=state.frames.findLast(frame=>frame.contextId===context.id&&frame.defaultFramebufferCalls>0);
  if(!main||!drain||main.status!=='signaled'||drain.status!=='signaled'||!main.callbackReturned||context.pendingObservedFrames!==0)return null;
  if(!checkpoint&&(!drain.callbackReturned||context.workRevision!==context.lastFenceWorkRevision))return null;
  if(context.defaultFramebufferRevision!==main.defaultFramebufferRevision)return null;
  if(Math.abs(Number(main.rearProgress)-progress)>=.015||canvas?.progress!==main.rearProgress||canvas.width!==main.bufferWidth||canvas.height!==main.bufferHeight||drain.bufferWidth!==main.bufferWidth||drain.bufferHeight!==main.bufferHeight)return null;
  return {main,drain,context,canvas};
}
export async function waitForHomePrefix({progress,timeout,read,checkpoint,pause,now=()=>performance.now()}) {
  assert.ok([budgets.nativeInitial,budgets.nativeLater].includes(timeout),'Original native45/30s bounds only');
  const startedAt=now(),deadline=startedAt+timeout,gate=progress===.08?'initial':progress===.5?'rear-1':'rear-2';let attempts=0;
  while(now()<deadline){
    const remaining=()=>Math.max(0,deadline-now()),value=await read(remaining());
    assert.ok(now()<deadline,'Original native-prefix deadline expired after read');
    const state=value.observation;if(state.stopped||state.issues.length)throw new Error('Native observer stopped or reported an issue');
    const certificate=rearCertificate(state,value.canvas,progress);if(certificate)return {...certificate,window:{startedAt,deadline,budget:timeout,attempts}};
    const context=state.contexts.filter(context=>context.sceneCanvas&&context.connected);
    if(context.length===1&&state.pendingObservedFrames===0&&state.frames.length&&state.frames.every(frame=>frame.status==='signaled')) {
      const current=state.checkpoints?.findLast(cp=>cp.gate===gate);
      if(!current||current.stale){assert.ok(attempts<4,'No clean native checkpoint within four attempts');const created=await checkpoint(gate,remaining());if(created)attempts++;}
    }
    if(remaining()>0)await pause(Math.min(100,remaining()));
  }
  throw new Error(`Original ${timeout}ms native-prefix deadline exceeded`);
}
async function waitRearCompletion(page,progress,timeout=budgets.nativeLater) {
  return waitForHomePrefix({progress,timeout,
    read:remaining=>bounded(page.evaluate(()=>{const canvas=document.querySelector('.home-signature-runway canvas');return {observation:globalThis.__r35HomeGpuFrames.snapshot(),canvas:canvas&&{progress:canvas.getAttribute('data-rear-progress'),width:canvas.width,height:canvas.height}};}),Math.min(budgets.command,remaining),'Native prefix snapshot'),
    checkpoint:(gate,remaining)=>bounded(page.evaluate(name=>globalThis.__r35HomeGpuFrames.checkpoint(name),gate),Math.min(budgets.command,remaining),'Native prefix checkpoint'),
    pause:ms=>page.waitForTimeout(ms)});
}
export async function exercise({page,context,row,shot,check,save,receipts,target,held,initialStarted,startup}) {
  if(startup)await startup();else {
  // The actual original local car/poster requests are delayed, never replaced or refetched.
  await check('decoded-poster-gate-while-car-pending',async()=>{
    const initialDeadline=initialStarted+budgets.initialPage;const left=()=>{const remaining=initialDeadline-performance.now();assert.ok(remaining>0,'Original single 25s poster/navigation deadline');return Math.min(budgets.command,remaining);};
    row.initialWindow={startedAt:initialStarted,deadline:initialDeadline,budget:budgets.initialPage};
    await page.waitForFunction(()=>document.querySelector('.home-loading-gate'),null,{timeout:left()});
    await held.poster.wait(left());row.audioBeforeAnyGesture=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());assert.equal(row.audioBeforeAnyGesture.events.some(event=>event.kind==='start'),false,'No audio before any trusted user gesture');row.gateBeforePoster=await page.evaluate(homeSnapshot,true);assert.equal(row.gateBeforePoster.gateOpen,true);assert.notEqual(row.gateBeforePoster.poster,'decoded');
    await held.poster.release();await held.car.wait(left());
    await page.waitForFunction(()=>document.querySelector('.home-film--hero')?.getAttribute('data-film-poster')==='decoded',null,{timeout:Math.max(1,initialDeadline-performance.now())});
    await page.waitForFunction(()=>document.querySelector('.home-loading-gate')?.getAttribute('data-state')==='resolved'&&!document.querySelector('.home-loading-gate')?.hasAttribute('open'),null,{timeout:left()});
    assert.equal(held.car.pending(),true,'Original car request still held');row.gateWhileCarHeld=await page.evaluate(homeSnapshot,held.car.pending());assert.ok(Object.values(assessGate(row.gateWhileCarHeld)).every(Boolean));
    await page.getByRole('button',{name:'Open menu',exact:true}).click({timeout:left()});await page.locator('.home-menu-dialog').waitFor({state:'visible',timeout:left()});
    row.navigationWhileCarPending={menuOpened:true,carStillHeld:held.car.pending(),elapsedMs:performance.now()-initialStarted};left();
    // Screenshots are separately timed captures, outside the 25s startup proof.
    await shot('poster-ready-car-pending-menu');await page.keyboard.press('Escape');await page.locator('.home-menu-dialog').waitFor({state:'hidden',timeout:budgets.command});
    await shot('poster-ready-car-pending');
  });
  await held.poster.release();await held.car.release();row.heldRequests=held.snapshot();await save();
  }
  await check('real-rear-ready',async()=>{await page.waitForFunction(()=>document.querySelector('.home-signature-runway')?.getAttribute('data-scene-state')==='ready',null,{timeout:budgets.ready});await page.waitForFunction(()=>!document.querySelector('.home-loading-gate')?.hasAttribute('open'),null,{timeout:budgets.initialPage});});
  await check('stable-poster-native-provider',async()=>{
    row.hero=await page.evaluate(homeSnapshot);assert.equal(row.hero.loadingFilmHeadline,false);assert.equal(row.hero.overflow,false);assert.equal(row.hero.poster,'decoded');assert.equal(row.hero.posterOpacity,'1');row.heroPixels=(await shot('hero')).heroPixels;
    row.provider=await sampleProviderPair(page);assert.equal(row.heroPixels.passed,true,'Actual hero PNG must contain nonblank image content outside text/controls');
  });
  await check('film-offscreen-and-automatic-reentry',async()=>{
    const start=await page.evaluate(homeSnapshot);assert.equal(start.films.find(f=>f.kind.includes('--hero'))?.iframes,1,'Initial hero embed must be present');
    await nativeSeek(page,await sectionTarget(page,'.home-expanding-runway'),budgets.nativeInitial);
    row.detailPoster=await waitForDetailPoster({page});row.filmOffscreen=await page.evaluate(homeSnapshot);row.detailPixels=(await shot('detail-film')).detailPixels;assert.equal(row.detailPixels.passed,true,'Actual detail PNG must contain nonblank image content outside controls/captions');
    await nativeSeek(page,0);await page.waitForFunction(()=>document.querySelectorAll('.home-film--hero iframe').length===1,null,{timeout:budgets.command});row.filmReentry=await page.evaluate(homeSnapshot);assert.equal(row.filmReentry.poster,'decoded');assert.equal(row.filmReentry.posterOpacity,'1');assert.equal(row.filmReentry.loadingFilmHeadline,false);row.heroReentryPixels=(await shot('hero-reentry')).heroPixels;assert.equal(row.heroReentryPixels.passed,true,'Actual reentry PNG must retain nonblank image content');
  });
  await check('three-actual-rear-dolly-poses',async()=>{
    row.rear=[];for(const progress of [.08,.5,.92]) {
      await nativeSeek(page,await sectionTarget(page,'.home-signature-runway',progress),progress===.08?budgets.nativeInitial:budgets.nativeLater);
      const before=await waitRearCompletion(page,progress,progress===.08?budgets.nativeInitial:budgets.nativeLater);const actual=before.main;
      const frame={progress,defaultFramebuffer:actual,nativeDrain:before.drain,workRevision:before.context.workRevision,scope:'Actual homepage rear/dolly only. Same progress pairs have the unchanged lighting rig; lighting intentionally changes between poses.'};row.rear.push(frame);
      frame.page=await shot(`rear-${progress}`);frame.canvas=await shot(`rear-${progress}-canvas`,page.locator('.home-signature-runway canvas'));
      if(progress===.92)frame.detail=await shot('rear-source-wing-lamp-detail',page.locator('.home-signature-runway canvas'),{detail:true});
      const after=await waitRearCompletion(page,progress);frame.after=after.main;frame.afterDrain=after.drain;assert.equal(frame.after.id,actual.id,'Capture must not substitute a newer main frame');assert.equal(after.context.workRevision,before.context.workRevision,'Native GL work changed during PNG capture');assert.deepEqual(after.canvas,before.canvas,'Canvas progress/buffer changed during PNG capture');
    }
  });
  async function freshSectionAudio(label) {
    const compact=page.locator('.home-signature-runway .r35-section-sound button[data-r35-sound-control]'),legacy=page.locator('.home-signature-sound');const mode=await compact.count()?'compact-section':'baseline-standalone';
    assert.ok(mode==='compact-section'||row.lane==='baseline','Candidate must use the compact section control');
    const control=mode==='compact-section'?compact:legacy.locator('.r35-sound-preview__play'),mute=mode==='compact-section'?compact:legacy.locator('.r35-sound-preview__mute');
    await nativeSeek(page,await sectionTarget(page,'.home-signature-runway',.92));await control.scrollIntoViewIfNeeded({timeout:budgets.command});
    if(mode==='compact-section'){if(await control.getAttribute('aria-pressed')==='true')await control.click({timeout:budgets.command});}
    else {if(await mute.getAttribute('aria-pressed')==='true')await mute.click({timeout:budgets.command});if(['loading','playing'].includes(await legacy.getAttribute('data-audio-phase')))await control.click({timeout:budgets.command});}
    await page.waitForFunction(()=>!globalThis.__r35HomeAudio.snapshot().edges.some(edge=>edge.active&&edge.fromKind==='source'),null,{timeout:budgets.command});
    await control.click({timeout:budgets.command});const atStart=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());
    const {playing,proof,window}=await waitForAudioProof({before:atStart,read:()=>page.evaluate(()=>globalThis.__r35HomeAudio.snapshot()),pause:ms=>page.waitForTimeout(ms)});assert.equal(proof.passed,true);assert.deepEqual(playing.issues,[]);
    row.audioEntries??=[];row.audioEntries.push({label,mode,atStart,playing,proof,window});return {control,mute};
  }
  await check('native-section-audio',async()=>{
    row.audioAtEntry=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());
    const handles=await freshSectionAudio('explicit-trusted-toggle');await shot('native-section-audio');
    await handles.mute.click({timeout:budgets.command});row.audioMuted=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());assert.ok(row.audioMuted.events.some(event=>event.kind==='stop'));assert.equal(row.audioMuted.edges.some(edge=>edge.active&&edge.fromKind==='source'),false);
    await freshSectionAudio('section-exit');const exitSource=row.audioEntries.at(-1).proof.sourceNodeId;await nativeSeek(page,0);await page.waitForFunction(nodeId=>globalThis.__r35HomeAudio.snapshot().events.some(event=>event.kind==='ended'&&event.nodeId===nodeId),exitSource,{timeout:budgets.command});row.audioExited=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());assert.equal(row.audioExited.edges.some(edge=>edge.active&&edge.fromKind==='source'),false,'Leaving the real audio section disconnects source');row.audioExitTiming={sourceNodeId:exitSource,scheduledStops:row.audioExited.events.filter(event=>event.kind==='stop'&&event.nodeId===exitSource),actualEnded:row.audioExited.events.filter(event=>event.kind==='ended'&&event.nodeId===exitSource)};
    // A genuine exit/entry after prior gesture should replay, without another button click.
    await nativeSeek(page,await sectionTarget(page,'.home-signature-runway',.92));await page.waitForFunction(()=>globalThis.__r35HomeAudio.snapshot().edges.some(edge=>edge.active&&edge.fromKind==='source'),null,{timeout:budgets.initialPage});row.audioReentered=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());
  });
  await check('native-hidden-policy',async()=>{
    await freshSectionAudio('native-hide');
    // Creating/focusing another real tab is the only hidden-state attempt. No synthetic visibility event or property override.
    const cover=await context.newPage();try{await cover.bringToFront();await page.waitForTimeout(300);row.nativeHidden=await page.evaluate(homeSnapshot);if(row.nativeHidden.visibility!=='hidden'){row.hiddenPolicy={status:'partial',reason:'Native tab focus did not hide the homepage in this runner'};return;}
      row.hiddenPolicy={status:'native-hidden-observed',snapshot:row.nativeHidden};assert.equal(row.nativeHidden.films.some(f=>f.iframes>0),false);const audioState=await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot());assert.equal(audioState.edges.some(edge=>edge.active&&edge.fromKind==='source'),false);
    }finally{await cover.close();await page.bringToFront();}
  });
  await check('licensed-formula-e-photo',async()=>{
    row.lineupScroll=await nativeSeek(page,await sectionTarget(page,'#home-lineup'),budgets.nativeInitial);const card=page.locator('.home-model-invitation--formula-e');await card.scrollIntoViewIfNeeded({timeout:budgets.command});
    row.formulaE=await card.evaluate(element=>{const image=element.querySelector('img');return {text:element.textContent,alt:image?.alt,currentSrc:image?.currentSrc,complete:image?.complete,naturalWidth:image?.naturalWidth};});
    await shot('formula-e-caption',card);assert.ok(row.formulaE.complete&&row.formulaE.naturalWidth>0);assert.ok(row.formulaE.currentSrc?.endsWith(formulaPhoto.path));assert.match(row.formulaE.text??'',/2024\/25/);
  });
  if(target.name==='mobile')for(const [name,viewport] of Object.entries(supplementaryViewports))await check(`layout-audio-${name}`,async()=>{
    await page.setViewportSize(viewport);const handles=await freshSectionAudio(name);
    const state=await page.evaluate(homeSnapshot);row.supplementary??=[];row.supplementary.push({name,...state});assert.equal(state.overflow,false);assert.ok(state.sound.length>0);for(const item of state.sound)for(const button of item.controls){assert.ok(button.rect.width>=44&&button.rect.height>=44);assert.ok(button.rect.x>=-1&&button.rect.right<=viewport.width+1);}
    const resized=await waitRearCompletion(page,1,budgets.nativeLater);assert.equal(resized.context.id,row.rear?.at(-1)?.defaultFramebuffer.contextId,'Native resize retains original homepage scene owner');assert.equal(resized.canvas.progress,'1.0000','Compact-height visuals use their actual sequential pose');row.supplementary.at(-1).nativeResize=resized;
    await shot(`audio-${name}`);const afterResizeShot=await waitRearCompletion(page,1,budgets.nativeLater);assert.equal(afterResizeShot.main.id,resized.main.id);assert.equal(afterResizeShot.context.workRevision,resized.context.workRevision);assert.deepEqual(afterResizeShot.canvas,resized.canvas);await handles.mute.click({timeout:budgets.command});
  });
  await receipts.drain();assert.ok(row.runtimeBodies.some(receipt=>receipt.path===detailPoster.path&&receipt.state==='body-completed'),'Actual original detail poster body required');
  await check('spa-exit-audio-gpu-cleanup',async()=>{
    await freshSectionAudio('native-menu-route-exit');
    row.beforeExit={gpu:await page.evaluate(()=>globalThis.__r35HomeGpuFrames.snapshot()),audio:await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot())};
    row.routeExitReceipt={actions:[],pathWait:{}};
    const action=async(name,run)=>{const receipt={name};row.routeExitReceipt.actions.push(receipt);await observeRouteAction({receipt,action:run,read:()=>page.evaluate(observeRouteExit),pause:ms=>page.waitForTimeout(ms)});};
    await action('open-menu',timeout=>page.getByRole('button',{name:'Open menu',exact:true}).click({timeout}));await action('models-link',timeout=>page.locator('.home-menu-primary a[href="/models"]').click({timeout}));
    await waitForRouteExit({receipt:row.routeExitReceipt.pathWait,read:()=>page.evaluate(observeRouteExit),pause:ms=>page.waitForTimeout(ms)});
    await page.waitForTimeout(500);row.afterExit={gpu:await page.evaluate(()=>globalThis.__r35HomeGpuFrames.snapshot()),audio:await page.evaluate(()=>globalThis.__r35HomeAudio.snapshot())};assert.equal(row.afterExit.audio.edges.some(e=>e.active&&e.fromKind==='source'),false);const recordingContexts=new Set(row.audioEntries.map(entry=>entry.proof.contextId));assert.ok(row.afterExit.audio.contexts.filter(context=>recordingContexts.has(context.id)).every(context=>context.state==='closed'),'Owned R35 recording contexts close; unrelated UI cue contexts are separate');assert.ok(row.afterExit.gpu.contexts.every(context=>!context.connected));
  });
}
export async function holdOriginalRequest(page,url) {
  let allow,seen,routeError;const proceed=new Promise(resolve=>{allow=resolve;}),requested=new Promise(resolve=>{seen=resolve;});
  const state={url,requested:false,released:false,continued:false,requests:0};
  const handler=async route=>{state.requests++;state.requested=true;seen();try{await proceed;await route.continue();state.continued=true;}catch(error){routeError=String(error);}};
  await page.route(url,handler);
  return {wait:(ms=budgets.initialPage)=>bounded(requested,ms,'Original held request appearance'),pending:()=>state.requested&&!state.released,
    async release(){if(!state.released){state.released=true;allow();}},snapshot:()=>({...state,error:routeError??null})};
}
export function createHomeShot({getPage,row,target,deadline,alive,output,save,PNG,posterReference,lane}) {
  return async(label,locator,options={})=>{
      const page=getPage();
      alive();const detailCaptureDeadline=label==='detail-film'?Math.min(deadline,performance.now()+budgets.screenshot):null;assert.ok(row.captures.length<28,'Bounded screenshot count');const file=`${lane}-${label}.png`;let clip;
      if(options.detail){const bounds=await locator.boundingBox();assert.ok(bounds);clip={x:Math.max(0,bounds.x+bounds.width*.12),y:Math.max(0,bounds.y+bounds.height*.18),width:Math.min(target.viewport.width,bounds.width*.76),height:Math.min(target.viewport.height*.65,bounds.height*.65)};}
      const heroGeometry=['hero','hero-reentry'].includes(label)?await bounded(page.evaluate(observeHeroPixelGeometry),budgets.command,'Actual hero region geometry'):null;
      const detailLeft=()=>{const remaining=detailCaptureDeadline-performance.now();assert.ok(remaining>0,'Original45000ms detail capture deadline');return remaining;};
      let detailGeometry=null;if(label==='detail-film'){const remaining=detailLeft();detailGeometry=await bounded(page.evaluate(observeDetailPixelGeometry),Math.min(budgets.command,remaining),'Actual detail region geometry');detailLeft();}
      if(detailGeometry)assert.equal(row.dist.files.find(file=>file.path==='dist'+detailPoster.path)?.sha256,detailPoster.sha256,'Exact source-bound detail photo');
      const capture={label,file,scope:options.detail?'Measured rear canvas detail crop; no alternate camera':locator?'Actual homepage canvas/element':'Actual homepage composition',...(clip?{clip}:{})};row.captures.push(capture);if(detailGeometry)detailLeft();await save();
      const captureBudget=detailGeometry?detailLeft():Math.min(budgets.screenshot,deadline-performance.now());
      const bytes=await bounded((clip?page:locator??page).screenshot({path:resolve(output,file),timeout:budgets.screenshot,animations:'allow',scale:'css',...(clip?{clip}:{})}),captureBudget,'Screenshot');
      if(detailGeometry){detailLeft();const detailPixels=assessDetailPixels(PNG.sync.read(bytes),detailGeometry);detailLeft();Object.assign(capture,{sha256:sha256(bytes),bytes:bytes.length,detailPixels});}
      else {Object.assign(capture,{sha256:sha256(bytes),bytes:bytes.length});if(heroGeometry)capture.heroPixels=assessHeroPixels(PNG.sync.read(bytes),heroGeometry,posterReference);}
      await save();if(detailGeometry)detailLeft();return capture;
    };
}
export async function main(env=process.env) {
  const root=resolve('.'),verified=await preflight(env,root);if(process.argv.includes('--preflight')){process.stdout.write(JSON.stringify(verified,null,2)+'\n');return;}
  const {request,target}=verified,output=resolve(root,'home-repair-results',target.name);await mkdir(output,{recursive:true});
  const report={contract,request,viewport:target,startedAt:new Date().toISOString(),harnessCommit:env.GITHUB_SHA,reconstruction:'Fresh reconstruction, 2026-10-14; the recovered old workflow is provenance only, not proof the lost original scripts were recovered.',status:'running',lanes:[],limitations:[
    'GitHub Chromium SwiftShader observations are not physical-device FPS or audible speaker-output certification.',
    'Source-bound screenshots require visual review. No automatic image approval is inferred.',
    'Only actual homepage rear/dolly cameras are available; no front/side material evidence is claimed.',
    'Lighting is unchanged between paired same-progress poses but intentionally changes between different homepage progress values.',
    'Cross-origin provider traffic stays untouched. Iframe loading is not playback or first-frame proof.',
    'Native hidden state remains partial if real tab focus cannot hide the page. No synthetic visibility override is used.',
    'One baseline-then-candidate pair has execution-order drift. No comparative timing or causal speedup claim.',
  ]};
  const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await save();
  const {chromium}=await import('@playwright/test');
  const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
  const posterReference=JSON.parse(await readFile(resolve(root,'qa/home-repair-pixel-fixtures/reference.json'),'utf8'));
  for(const lane of ['baseline','candidate']) {
    const laneRoot=lane==='baseline'?resolve(root,'../baseline-app'):root;
    const row={lane,status:'running',checks:[],captures:[],errors:[],pageErrors:[],console:[],providerResponses:[],runtimeBodies:[]};report.lanes.push(row);await save();
    let server,browser,context,page,receipts,held;const deadline=performance.now()+budgets.lane;let expired=false;
    const alive=()=>{assert.equal(expired,false,'Original lane deadline exhausted');assert.ok(performance.now()<deadline,'Original lane deadline exhausted');};
    const shot=createHomeShot({getPage:()=>page,row,target,deadline,alive,output,save,PNG,posterReference,lane});
    const check=async(name,run)=>{alive();const check={name,status:'running',startedAt:new Date().toISOString()};row.checks.push(check);await save();try{await run();check.status='passed';}catch(error){check.status='failed';check.error=String(error);row.errors.push({check:name,message:String(error)});}finally{check.finishedAt=new Date().toISOString();await save();}};
    try {
      row.identity=await verifyCheckout(laneRoot,lane,request,env);row.dist=await distIdentity(laneRoot);
      const pins=new Map(row.dist.files.map(file=>['/'+file.path.slice('dist/'.length),{bytes:file.bytes,sha256:file.sha256}]));
      assert.deepEqual(pins.get(model.path),{bytes:model.bytes,sha256:model.sha256},'Unchanged original Ciasny asset');assert.equal(pins.get(audio.path)?.sha256,audio.sha256,'Exact licensed source recording');assert.equal(pins.get('/media/campaign-r35-orange-hero.webp')?.sha256,posterReference.sourceSha256,'Pixel calibration belongs to this exact real poster');
      if(lane==='candidate')assert.equal(pins.get(formulaPhoto.path)?.sha256,formulaPhoto.sha256,'Exact requested Formula E photograph');
      const {createAppServer}=await import(pathToFileURL(resolve(laneRoot,'server.mjs')));
      server=createAppServer(resolve(laneRoot,'dist'));await bounded(new Promise((done,reject)=>{server.once('error',reject);server.listen(4189,'127.0.0.1',done);}),budgets.command,'CI loopback server startup');
      browser=await chromium.launch({timeout:budgets.nativeLater,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
      context=await browser.newContext({viewport:target.viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block',...(target.name==='mobile'?{isMobile:true,hasTouch:true}:{})});
      await context.addInitScript(installHomeRepairGpuObserver,{windowMs:budgets.lane});await context.addInitScript(installHomeRepairAudioObserver);
      page=await context.newPage();page.setDefaultTimeout(budgets.command);page.setDefaultNavigationTimeout(budgets.nativeInitial);
      page.on('pageerror',error=>row.pageErrors.push(String(error)));page.on('console',message=>{if(['error','warning'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
      page.on('response',response=>{const url=new URL(response.url());if(url.hostname==='media.flixel.com'&&row.providerResponses.length<100)row.providerResponses.push({url:response.url(),status:response.status(),resourceType:response.request().resourceType()});});
      receipts=createUiReceipts({page,origin:target.origin,pins,receipts:row.runtimeBodies});
      const poster=await holdOriginalRequest(page,target.origin+'/media/campaign-r35-orange-hero.webp'),car=await holdOriginalRequest(page,target.origin+model.path);held={poster,car,snapshot:()=>({poster:poster.snapshot(),car:car.snapshot()})};
      await bounded((async()=>{
        const initialStarted=performance.now();await receipts.navigate(target.origin+'/');
        await exercise({page,context,row,shot,check,save,receipts,target,held,initialStarted});
        await receipts.finish();row.runtimeLedger=receipts.snapshot();
        for(const path of ['/index.html',model.path,audio.path])assert.ok(row.runtimeBodies.some(receipt=>receipt.path===path&&receipt.state==='body-completed'),`Actual original runtime body required: ${path}`);
        assert.ok(row.runtimeBodies.some(receipt=>receipt.path.endsWith('.js')&&receipt.state==='body-completed'));assert.ok(row.runtimeBodies.some(receipt=>receipt.path.endsWith('.css')&&receipt.state==='body-completed'));
        if(lane==='candidate')assert.ok(row.runtimeBodies.some(receipt=>receipt.path===formulaPhoto.path&&receipt.state==='body-completed'));
        assert.deepEqual(row.pageErrors,[],'No application JavaScript exceptions');row.status=row.errors.length?'failed':'passed';
      })(),Math.max(1,deadline-performance.now()),'Entire lane');
    }catch(error){row.status='failed';row.errors.push({message:String(error),stack:error.stack});}
    finally {
      expired=true;
      if(held){await held.poster.release();await held.car.release();row.heldRequests=held.snapshot();}
      if(receipts){row.runtimeLedger=receipts.snapshot();receipts.stop();}
      if(page&&!page.isClosed())try{row.finalObservation=await bounded(page.evaluate(()=>{const gpu=globalThis.__r35HomeGpuFrames?.snapshot(),audio=globalThis.__r35HomeAudio?.snapshot();globalThis.__r35HomeGpuFrames?.stop('lane-ended');globalThis.__r35HomeAudio?.stop();return {gpu,audio};}),budgets.command,'Final native observation');}catch(error){row.errors.push({message:String(error)});row.status='failed';}
      await save();
      for(const [label,cleanup] of [['Browser context cleanup',()=>context?.close()],['Browser cleanup',()=>browser?.close()],['Server cleanup',()=>{if(!server)return;server.closeAllConnections();return new Promise(done=>server.close(done));}]])try{await bounded(Promise.resolve(cleanup()),budgets.cleanup,label);}catch(error){row.status='failed';row.errors.push({message:String(error)});}
      row.finishedAt=new Date().toISOString();await save();
    }
    // Deliberately no baseline-failure break: candidate is an independent lane.
  }
  report.status=report.lanes.find(row=>row.lane==='candidate')?.status==='passed'?'candidate-passed':'failed';report.baselineStatus=report.lanes.find(row=>row.lane==='baseline')?.status;report.finishedAt=new Date().toISOString();await save();
  assert.equal(report.status,'candidate-passed','Candidate source-bound homepage acceptance');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
