/** Source-bound browser proof. Run only in authorized GitHub CI; never against public production. */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createUiReceipts } from './ui-optimization-receipts.mjs';
import { baselineCommit, contract, sha256, sourceIdentity, validateRequest, summarizeTrace, compareSnapshots } from './ui-optimization-policy.mjs';

const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
export async function verifyCheckout(root,lane,request,env) {
  const commit=git(root,['rev-parse','HEAD']);
  assert.equal(commit,lane==='baseline'?baselineCommit:env.GITHUB_SHA);
  assert.equal(git(root,['status','--porcelain','--untracked-files=no']),'');
  const source=await sourceIdentity(root);
  assert.equal(source.sha256,request[`${lane}Tree`],`${lane}: exact reviewed source identity`);
  return {commit,gitTree:git(root,['rev-parse','HEAD^{tree}']),fullTrackedCheckoutClean:true,source};
}
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function bounded(promise,ms,label) {let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}: ${ms}ms original deadline exceeded`)),ms);})]);}finally{clearTimeout(timer);}}
function homeSnapshot(input=0) {
  const selectors=['[data-motion-section]','.home-expanding-frame','.home-film-viewport','.home-film-controls','.home-film-enlarge','.home-archive-chapter','.home-timeline-image','.home-timeline-image img','.home-r32-stage','.home-hero-copy','.home-hero-support a'];
  const round=n=>Math.round(n*100)/100;
  return {input,y:scrollY,height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
    activeEra:document.querySelector('#home-heritage')?.getAttribute('data-active-era'),
    sequential:document.querySelector('.cinematic-home')?.getAttribute('data-sequential-motion'),
    providerStates:[...document.querySelectorAll('.home-film')].map(element=>({kind:element.className,state:element.getAttribute('data-film-state'),document:element.getAttribute('data-film-document'),playback:element.getAttribute('data-film-playback')})),
    nodes:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map((element,index)=>{
      const r=element.getBoundingClientRect(),s=getComputedStyle(element);
      return {key:`${selector}:${index}`,rect:{x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)},style:Object.fromEntries(['opacity','transform','objectFit','objectPosition','clipPath','filter'].map(key=>[key,s[key]]))};
    }))};
}
async function settledHomeSnapshot(page,input,scriptDeadline) {
  const deadline=Math.min(performance.now()+2000,scriptDeadline);let previous,stable=0;
  while(performance.now()<deadline) {
    await page.waitForTimeout(40);
    const sample=await page.evaluate(homeSnapshot,input);
    const serialized=JSON.stringify({...sample,providerStates:undefined});
    stable=serialized===previous?stable+1:0;previous=serialized;
    if(stable>=2&&performance.now()<deadline)return sample;
  }
  throw new Error('Native scroll checkpoint did not settle within its original 2000ms deadline');
}
async function workloadIdentity(root) {
  const files=[];
  async function walk(directory) {
    for(const entry of (await readdir(resolve(root,'dist',directory),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      assert.equal(entry.isSymbolicLink(),false,'Built workload symlink is not accepted');
      const path=directory?`${directory}/${entry.name}`:entry.name;
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile()&&path!=='index.html'&&!/^assets\/.*\.(?:js|css|map)$/.test(path)) {const bytes=await readFile(resolve(root,'dist',path));files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
    }
  }
  await walk('');return {sha256:sha256(JSON.stringify(files)),files};
}
function modalSnapshot() {
  const dialog=document.querySelector('.drawer'),body=dialog?.querySelector('.drawer-body');
  const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  const controls=[...(dialog?.querySelectorAll('button,input,select,a[href]')||[])];
  const hitTargets=[...(dialog?.querySelectorAll('button,.render-quality label')||[])];
  return {y:scrollY,title:document.title,documentHeight:document.documentElement.scrollHeight,documentStyle:{html:document.documentElement.getAttribute('style'),body:document.body.getAttribute('style')},
    bodyOverflow:getComputedStyle(document.body).overflow,htmlOverflow:getComputedStyle(document.documentElement).overflow,
    dialog:rect(dialog),drawerScroll:body?.scrollTop,drawerScrollHeight:body?.scrollHeight,drawerClientHeight:body?.clientHeight,
    drawerStyle:dialog?{background:getComputedStyle(dialog).backgroundColor,backdropFilter:getComputedStyle(dialog).backdropFilter,opacity:getComputedStyle(dialog).opacity,transform:getComputedStyle(dialog).transform}:null,
    inert:[...document.querySelectorAll('[inert]')].map(element=>({tag:element.tagName,id:element.id,className:typeof element.className==='string'?element.className:'',value:element.getAttribute('inert')})),
    outsideControls:[...document.querySelectorAll('a[href],button,input,select,[tabindex="0"]')].filter(element=>!element.closest('.drawer-layer')).map(element=>({label:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,70),disabled:element.matches(':disabled'),inert:Boolean(element.closest('[inert]'))})),
    focusInside:!!dialog?.contains(document.activeElement),phase:dialog?.getAttribute('data-phase'),
    hitTargets:hitTargets.map(element=>({label:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,90),rect:rect(element)})),
    controls:controls.map(element=>({tag:element.tagName,label:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,90),disabled:element.matches(':disabled'),rect:rect(element),focused:element===document.activeElement,outline:getComputedStyle(element).outline,focusVisible:element.matches(':focus-visible'),pressed:element.getAttribute('aria-pressed')}))};
}
async function traceWindow(cdp,action) {
  const events=[];let traceComplete;
  const done=new Promise(resolve=>{traceComplete=resolve;});
  const consume=record=>events.push(...record.value);
  cdp.on('Tracing.dataCollected',consume);cdp.once('Tracing.tracingComplete',traceComplete);
  await cdp.send('Performance.enable');
  const before=await cdp.send('Performance.getMetrics');
  await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.frame',transferMode:'ReportEvents'});
  const started=performance.now();
  try {await action();}
  finally {await cdp.send('Tracing.end');await bounded(done,15000,'Trace completion');cdp.off('Tracing.dataCollected',consume);}
  const after=await cdp.send('Performance.getMetrics');
  const baseline=new Map(before.metrics.map(m=>[m.name,m.value]));
  return {elapsedMs:performance.now()-started,summary:summarizeTrace(events),performanceDelta:Object.fromEntries(after.metrics.filter(m=>['LayoutCount','LayoutDuration','RecalcStyleCount','RecalcStyleDuration','ScriptDuration','TaskDuration'].includes(m.name)).map(m=>[m.name,m.value-(baseline.get(m.name)||0)])),events};
}
async function nativeSeek(page,target) {
  await page.mouse.move(8,8);
  for(let i=0;i<180;i++) {const y=await page.evaluate(()=>scrollY),delta=target-y;if(Math.abs(delta)<2)return;await page.mouse.wheel(0,Math.sign(delta)*Math.min(480,Math.abs(delta)));await page.waitForTimeout(90);}
  throw new Error('Native wheel seek did not reach its bounded target');
}
async function exerciseHome({page,context,target,lane,output,row,save,plan,shot,expect,drain,navigate}) {
  await navigate(target.origin+'/');
  const gate=page.locator('.home-loading-gate');await expect(gate).toBeAttached({timeout:15000});
  if(await gate.getAttribute('data-state')!=='resolved') {
    try {await gate.getByRole('button',{name:'Continue without 3D',exact:true}).click({timeout:5000});}
    catch(error) {if(await gate.getAttribute('data-state')!=='resolved')throw error;}
  }
  await expect(gate).toHaveAttribute('data-state','resolved',{timeout:15000});await expect(gate).not.toBeVisible({timeout:15000});
  await bounded(page.evaluate(()=>document.fonts.ready.then(()=>true)),15000,'Homepage fonts');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.cinematic-home').getAttribute('data-reduced-motion'),String(target.reducedMotion==='reduce'));
  await expect(page.locator('h1')).toBeVisible();
  await shot('home-initial');
  const start=await page.evaluate(homeSnapshot,0);assert.equal(start.overflow,false);
  if(!plan) {
    const delta=Math.round(target.viewport.height*.48),count=Math.ceil((start.height-target.viewport.height)/delta)+2;
    assert.ok(count>5&&count<=160,'Bounded exact native scroll script');
    plan=[...Array(count).fill(delta),...Array(count).fill(-delta)];
  }
  row.home={plan,initial:start,checkpoints:[],anchors:[],measurementScope:'Chromium trace covers participating processes; provider frame activity can contribute independent Layout/Paint. Provider document/playback states are retained at every checkpoint. Short/narrow/reduced sequential layouts are functional controls, not blur-improvement evidence.',scope:'Homepage UI path explicitly chooses Continue without 3D if the preparation gate is unresolved. Provider media is left native; iframe loading is not playback acceptance.'};await save();
  const cdp=await context.newCDPSession(page);
  await page.mouse.move(8,8);
  const scriptDeadline=performance.now()+90000;
  const timing=await traceWindow(cdp,async()=>{
    for(let i=0;i<plan.length;i++) {
      assert.ok(performance.now()<scriptDeadline,'Original 90-second total native-scroll script deadline');
      await page.mouse.wheel(0,plan[i]);
      row.home.checkpoints.push(await settledHomeSnapshot(page,plan[i],scriptDeadline));
    }
  });
  await writeFile(resolve(output,`${lane}-home-trace.json`),JSON.stringify({traceEvents:timing.events}));delete timing.events;row.home.timing=timing;
  assert.equal(row.home.checkpoints.at(-1).y,0,'Reverse native wheel sequence returns to top');
  assert.equal(row.home.checkpoints.some(s=>s.overflow),false,'No horizontal document overflow');
  const midpoint=row.home.checkpoints[Math.floor(plan.length/2)-1];assert.ok(midpoint.y+target.viewport.height>=midpoint.height-2,'Forward native sequence reaches page end');
  await save();
  // Screenshots and interactive controls are outside the trace timing window.
  const filmTarget=await page.locator('.home-expanding-runway').evaluate(element=>{const r=element.getBoundingClientRect();return scrollY+r.y+Math.max(0,(r.height-innerHeight)/2);});
  await nativeSeek(page,filmTarget);await page.waitForTimeout(350);row.home.film=await page.evaluate(homeSnapshot,0);await shot('home-film-settled');
  const expand=page.getByRole('button',{name:'Enlarge driving film',exact:true});await expect(expand).toBeVisible();
  const expandBounds=await expand.boundingBox();assert.ok(expandBounds?.width>=44&&expandBounds.height>=44,'Unscaled film enlarge target is at least 44px');
  await expand.click();await expect(page.getByRole('dialog',{name:'GT-R driving film'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'GT-R driving film'})).not.toBeVisible();await expect(expand).toBeFocused();
  const buttons=page.getByRole('navigation',{name:'GT-R eras'}).getByRole('button');
  for(const index of [0,1,2,3,2,0]) {
    const button=buttons.nth(index);await button.click();
    await expect(button).toHaveAttribute('aria-current','step',{timeout:5000});
    await page.waitForTimeout(target.reducedMotion==='reduce'?80:850);
    const anchor=await page.locator(`[data-era-image="${index}"]`).evaluate(element=>({id:element.id,focused:document.activeElement===element,top:element.getBoundingClientRect().top,scrollY}));
    assert.equal(anchor.focused,true,'Era navigation retains destination focus');assert.ok(anchor.top>=-2&&anchor.top<target.viewport.height,'Era destination remains in viewport');row.home.anchors.push({index,...anchor});
    if(index===1&&row.home.anchors.length===2)await shot('home-heritage-settled');
  }
  await drain();await save();return plan;
}
async function exerciseDrawer({page,target,lane,row,shot,expect,drain,save,navigate}) {
  row.drawer=[];
  const check=(entry,label,value)=>{entry.checks.push({label,passed:!!value});};
  async function openAndSettle(name) {
    const trigger=page.getByRole('button',{name,exact:true,includeHidden:true});await trigger.click();
    const dialog=page.locator('.drawer');await expect(dialog).toHaveAttribute('data-phase','open');
    const started=performance.now();const diagnostics={panel:name,startedAt:started,originalDeadlineMs:5000,samples:[],status:'running'};
    row.animationDiagnostics??=[];row.animationDiagnostics.push(diagnostics);
    const inspect=()=>dialog.evaluate(element=>{
      const r=element.getBoundingClientRect(),style=getComputedStyle(element);
      return {at:performance.now(),rect:{x:r.x,y:r.y,width:r.width,height:r.height},opacity:style.opacity,transform:style.transform,animationName:style.animationName,animationDuration:style.animationDuration,animationIterationCount:style.animationIterationCount,
        animations:element.getAnimations().map(animation=>({type:animation.constructor.name,name:animation.animationName||null,playState:animation.playState,currentTime:animation.currentTime,startTime:animation.startTime,playbackRate:animation.playbackRate,pending:animation.pending,timelineTime:animation.timeline?.currentTime??null,target:animation.effect?.target?{tag:animation.effect.target.tagName,className:animation.effect.target.className,id:animation.effect.target.id}:null,timing:animation.effect?.getTiming(),computedTiming:animation.effect?.getComputedTiming()}))};
    });
    try {
      await expect.poll(async()=>{const sample=await inspect();diagnostics.samples.push(sample);await save();return sample.animations.filter(animation=>animation.playState==='running').length;},{timeout:5000}).toBe(0);
      diagnostics.status='settled';diagnostics.elapsedMs=performance.now()-started;
      await expect.poll(()=>dialog.evaluate(element=>getComputedStyle(element).opacity),{timeout:5000}).toBe('1');
    } catch(error) {
      diagnostics.status='failed';diagnostics.elapsedMs=performance.now()-started;diagnostics.originalError=String(error);await save();
      try {await shot(`${name.toLowerCase()}-animation-failure-${row.animationDiagnostics.length}`);diagnostics.afterFailureCapture=await inspect();}
      catch(captureError){diagnostics.captureError=String(captureError);}
      await save();throw error;
    }
    return {trigger,dialog};
  }
  for(const model of ['nismo','premium']) {
    await navigate(`${target.origin}/configurator/${model}`);
    await expect(page.getByRole('button',{name:'Environment',exact:true})).toBeVisible({timeout:20000});
    if(model==='premium')await expect(page.getByRole('button',{name:'Ultimate Silver',exact:true})).toBeEnabled({timeout:90000});
    await bounded(page.evaluate(()=>document.fonts.ready.then(()=>true)),15000,'Drawer fonts');
    for(const panel of ['Environment','Camera']) {
      const before=await page.evaluate(modalSnapshot);
      const {trigger,dialog}=await openAndSettle(panel);
      const entry={model,panel,checks:[],before,settled:await page.evaluate(modalSnapshot)};row.drawer.push(entry);await save();
      check(entry,'Dialog retains visible settled content',entry.settled.drawerStyle.opacity==='1'&&entry.settled.dialog.width>250);
      check(entry,'All background interactive controls are inert',entry.settled.outsideControls.every(control=>control.inert));
      check(entry,'Document scroll is locked',entry.settled.bodyOverflow==='hidden'&&entry.settled.htmlOverflow==='hidden');
      check(entry,'Focus starts inside the actual drawer',entry.settled.focusInside);
      check(entry,'Drawer and label hit targets retain 44px bounds',entry.settled.hitTargets.every(item=>item.rect.width>=43.9&&item.rect.height>=43.9));
      // Focusing an inert real background control must be rejected by the browser.
      const focusBlocked=await trigger.evaluate(element=>{element.focus({preventScroll:true});return document.activeElement!==element;});
      check(entry,'Programmatic background focus is rejected by native inert',focusBlocked);
      await dialog.focus();
      for(let i=0;i<10;i++){await page.keyboard.press(i%3===0?'Shift+Tab':'Tab');check(entry,`Native Tab stays inside drawer ${i}`,await dialog.evaluate(element=>element.contains(document.activeElement)));}
      if(panel==='Environment'&&model==='premium') {
        const radio=dialog.getByRole('radio',{name:/Standard/});await radio.focus();await page.keyboard.press('ArrowRight');
        await expect(dialog.getByRole('radio',{name:/Reduced/})).toBeChecked();entry.radio=await page.evaluate(modalSnapshot);await shot(`${model}-${panel.toLowerCase()}-focus-settled`);
        check(entry,'Native radio visible focus remains inside drawer',entry.radio.controls.some(control=>control.tag==='INPUT'&&control.focused&&control.focusVisible));
      } else await shot(`${model}-${panel.toLowerCase()}-settled`);
      const body=dialog.locator('.drawer-body'),bodyBounds=await body.boundingBox();assert.ok(bodyBounds);
      await page.mouse.move(bodyBounds.x+bodyBounds.width*.5,Math.min(target.viewport.height-15,bodyBounds.y+bodyBounds.height*.5));
      for(let i=0;i<7;i++){await page.mouse.wheel(0,650);await page.waitForTimeout(70);}
      entry.bottom=await page.evaluate(modalSnapshot);
      check(entry,'Wheel does not scroll the background',Math.abs(entry.bottom.y-entry.settled.y)<1);
      check(entry,'All drawer content reachable by its own scroll area',entry.bottom.drawerScroll+entry.bottom.drawerClientHeight>=entry.bottom.drawerScrollHeight-2);
      if(panel==='Environment')await shot(`${model}-environment-bottom`);
      await page.keyboard.press('Escape');
      if(target.reducedMotion!=='reduce') {
        entry.closing=await page.evaluate(modalSnapshot);
        check(entry,'Background remains inert through closing presence',entry.closing.phase==='closing'&&entry.closing.outsideControls.every(control=>control.inert));
      }
      await expect(dialog).toHaveCount(0,{timeout:5000});entry.closed=await page.evaluate(modalSnapshot);
      check(entry,'Escape restores exact prior inline document style',JSON.stringify(entry.closed.documentStyle)===JSON.stringify(before.documentStyle));
      check(entry,'Escape restores exact prior inert attributes',JSON.stringify(entry.closed.inert)===JSON.stringify(before.inert));
      check(entry,'Escape restores opener focus',await trigger.evaluate(element=>document.activeElement===element));
      // The close icon is a separate native dismissal path.
      await openAndSettle(panel);await page.locator('.drawer').getByRole('button',{name:'Close panel',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
      await save();
    }
    // Model selection changes the real SPA route while the drawer is present.
    const prior=await page.evaluate(modalSnapshot);await openAndSettle('Switch model');
    const other=model==='premium'?'NISMO Precision under pressure.':'Premium The icon, distilled.';
    await page.locator('.drawer').getByRole('button',{name:other,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`/configurator/${model==='premium'?'nismo':'premium'}$`));await expect(page.locator('.drawer')).toHaveCount(0,{timeout:5000});
    const after=await page.evaluate(modalSnapshot);row.drawer.push({model,panel:'route-unmount',checks:[{label:'SPA model selection clears document lock and inert exactly',passed:JSON.stringify(after.documentStyle)===JSON.stringify(prior.documentStyle)&&JSON.stringify(after.inert)===JSON.stringify(prior.inert)}],before:prior,after});
    await drain();await save();
  }
  const failures=row.drawer.flatMap(entry=>entry.checks.filter(check=>!check.passed).map(check=>`${entry.model} ${entry.panel}: ${check.label}`));
  row.drawerFailures=failures;await save();
  if(lane==='candidate')assert.deepEqual(failures,[],'Candidate real Drawer acceptance');
}
export async function main(env=process.env) {
  const harness=resolve('.'),request=JSON.parse(await readFile(resolve(harness,'qa/ui-optimization-request.json'),'utf8'));
  const target=validateRequest(request, env);
  const output=resolve(harness,'ui-optimization-results',target.name);await mkdir(output,{recursive:true});
  const report={contract,request,harnessCommit:env.GITHUB_SHA,viewport:target,startedAt:new Date().toISOString(),status:'running',lanes:[],limitations:['GitHub Chromium software rendering and event timings are not hardware-device FPS.','Provider iframe loading is not film playback acceptance.','Timed windows use identical native wheel inputs and bounded three-sample settled DOM snapshots; these snapshots themselves cause layout/computed-style reads. Screenshots remain outside timing, so these are instrumented UI trace costs, not pure app benchmark costs.','Baseline inert/scroll isolation failures are recorded as reproduction; only candidate isolation must pass.','One baseline-then-candidate pair per viewport has execution-order drift and no repetitions. Observed Layout/Paint costs are descriptive, without a causal speedup or latency claim.']};
  const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await save();
  const {chromium,expect}=await import('@playwright/test');let plan,baselineWorkload;
  for(const lane of ['baseline','candidate']) {
    const root=lane==='baseline'?resolve(harness,'../baseline-app'):harness;
    const identity=await verifyCheckout(root, lane, request, env);
    const workload=await workloadIdentity(root);
    if(lane==='baseline')baselineWorkload=workload;else assert.deepEqual(workload,baselineWorkload,'Matched exact non-bundle assets and model workload');
    const row={lane,...identity,workload,status:'running',captures:[],pageErrors:[],console:[],runtimeBodies:[],errors:[]};report.lanes.push(row);await save();
    const pin=bytes=>({sha256:sha256(bytes),bytes:bytes.length});
    const bundles=new Map([['/index.html',pin(await readFile(resolve(root,'dist/index.html')))]]);
    for(const name of await readdir(resolve(root,'dist/assets')))if(/\.(js|css)$/.test(name))bundles.set('/assets/'+name,pin(await readFile(resolve(root,'dist/assets',name))));
    const {createAppServer}=await import(pathToFileURL(resolve(root, 'server.mjs')));
    let server,browser,context,page,receiptCollector;
    const drain=async()=>{try{return await receiptCollector.drain();}finally{row.runtimeLedger=receiptCollector.snapshot();}};
    const navigate=async url=>{try{return await receiptCollector.navigate(url);}finally{row.runtimeLedger=receiptCollector.snapshot();await save();}};
    try {
      server=createAppServer(resolve(root,'dist'));await new Promise((done,reject)=>{server.once('error',reject);server.listen(4189,'127.0.0.1',done);});
      browser=await chromium.launch({timeout:30000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
      context=await browser.newContext({viewport:target.viewport,deviceScaleFactor:1,reducedMotion:target.reducedMotion,serviceWorkers:'block'});
      page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(45000);
      page.on('pageerror',error=>row.pageErrors.push(String(error)));
      page.on('console',message=>{if(['error','warning'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
      receiptCollector=createUiReceipts({page,origin:target.origin,pins:bundles,receipts:row.runtimeBodies});
      const shot=async label=>{const file=`${lane}-${label}.png`;assert.ok(row.captures.length<24,'Bounded screenshots');const bytes=await page.screenshot({path:resolve(output,file),timeout:45000,animations:'allow',scale:'css'});row.captures.push({label,file,sha256:sha256(bytes)});await save();};
      plan=await exerciseHome({page,context,target,lane,output,row,save,plan,shot,expect,drain,navigate});
      await drain();await exerciseDrawer({page,target,lane,row,shot,expect,drain,save,navigate});await drain();
      await receiptCollector.finish();row.runtimeLedger=receiptCollector.snapshot();
      assert.ok(row.runtimeBodies.some(receipt=>receipt.path==='/index.html'));
      assert.ok(row.runtimeBodies.some(receipt=>receipt.path.endsWith('.js')));
      assert.ok(row.runtimeBodies.some(receipt=>receipt.path.endsWith('.css')));
      assert.deepEqual(row.pageErrors,[],'No application/page JavaScript exceptions');row.status='passed';
    } catch(error) {row.status='failed';row.errors.push({message:String(error),stack:error.stack});}
    finally {
      if(receiptCollector){row.runtimeLedger=receiptCollector.snapshot();receiptCollector.stop();}
      await save();
      if(context)await bounded(context.close(),15000,'Browser context cleanup').catch(error=>{row.status='failed';row.errors.push({message:String(error)});});
      if(browser)await bounded(browser.close(),15000,'Browser cleanup').catch(error=>{row.status='failed';row.errors.push({message:String(error)});});
      if(server){server.closeAllConnections();await bounded(new Promise(done=>server.close(done)),15000,'Server cleanup').catch(error=>{row.status='failed';row.errors.push({message:String(error)});});}
      await save();
    }
    if(row.status==='failed')break;
  }
  if(report.lanes.length===2&&report.lanes.every(row=>row.status==='passed')) {
    report.choreographyDifferences=compareSnapshots(report.lanes[0].home.checkpoints,report.lanes[1].home.checkpoints);
    report.status=report.choreographyDifferences.length?'failed':'passed';
    report.metricComparison=Object.fromEntries(['Layout','UpdateLayoutTree','Paint','PrePaint','DrawFrame','DroppedFrame'].map(name=>[name,{baseline:report.lanes[0].home.timing.summary[name],candidate:report.lanes[1].home.timing.summary[name]}]));
  } else report.status='failed';
  report.finishedAt=new Date().toISOString();await save();assert.equal(report.status,'passed','Exact staged UI browser acceptance');
}
export { exerciseDrawer, traceWindow, workloadIdentity };
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
