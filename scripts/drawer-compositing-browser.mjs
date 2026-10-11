/** CI-only v2 direct-entry Drawer comparison. Each lane owns a fresh Node/browser process. */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { sourceIdentity, sha256 } from './ui-optimization-policy.mjs';
import { exerciseDrawer, traceWindow, workloadIdentity } from './ui-optimization-browser.mjs';
import { createUiReceipts } from './ui-optimization-receipts.mjs';
import { drawerBaselineCommit, drawerContract, validateDrawerRequest, assessDrawerLanes } from './drawer-compositing-policy.mjs';
const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
async function bounded(work,ms,label){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}: original ${ms}ms deadline exceeded`)),ms);})]);}finally{clearTimeout(timer);}}
// Return real Playwright Locators, decorating only the existing opening click.
// No substituted DOM clicks, polling, action options or application state writes.
export function observeOpeningClicks(page,observations,now=()=>performance.now()) {
  return new Proxy(page,{get(target,key){
    if(key==='getByRole')return (...args)=>{
      const locator=target.getByRole(...args),options=args[1];
      if(args[0]==='button'&&options?.includeHidden===true&&['Environment','Camera','Switch model'].includes(options.name)) {
        const click=locator.click.bind(locator);
        locator.click=async(...clickArgs)=>{
          const item={panel:options.name,actionStartMs:now(),clock:'Node performance.now',status:'running'};observations.push(item);
          try {const value=await click(...clickArgs);item.clickReturnMs=now();item.status='returned';return value;}
          catch(error){item.clickReturnMs=now();item.status='failed';item.error=String(error);throw error;}
          finally {item.clickDurationMs=item.clickReturnMs-item.actionStartMs;}
        };
      }
      return locator;
    };
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
}
// Every continuation checks the original capture deadline before publishing data
// or beginning the next browser operation. A late body cannot revive a failure.
export async function recordDrawerCapture({capture,readStyles,screenshot,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}) {
  capture.actionStartMs=now();capture.originalDeadlineMs=45000;capture.status='running';
  const deadline=capture.actionStartMs+45000;let active=true,timer;
  const current=()=>{assert.ok(active&&now()<=deadline,'Drawer styles and screenshot: original 45000ms deadline exceeded');};
  const timeout=new Promise((_,reject)=>{timer=setTimer(()=>{active=false;reject(new Error('Drawer styles and screenshot: original 45000ms deadline exceeded'));},45000);});
  const work=(async()=>{
    current();const styles=await readStyles();current();capture.styles=styles;
    capture.captureStartMs=now();const bytes=await screenshot();current();
    capture.captureReturnMs=now();capture.captureDurationMs=capture.captureReturnMs-capture.captureStartMs;capture.sha256=sha256(bytes);
  })();
  try {await Promise.race([work,timeout]);current();capture.status='captured';}
  catch(error){capture.status='failed';capture.error=String(error);throw error;}
  finally {active=false;clearTimer(timer);capture.observationEndMs=now();capture.observationDurationMs=capture.observationEndMs-capture.actionStartMs;}
}
export function ownershipRetired(result,cleanup) {
  return [0,1].includes(result.exitCode)&&!result.timedOut&&!result.signal&&!result.spawnError&&['context','browser','server'].every(name=>cleanup?.[name]==='passed');
}
export async function verifyDrawerCheckout(root,lane,request,env) {
  const commit=git(root,['rev-parse','HEAD']);assert.equal(commit,lane==='baseline'?drawerBaselineCommit:env.GITHUB_SHA);
  assert.equal(git(root,['status','--porcelain','--untracked-files=no']),'');
  const source=await sourceIdentity(root);assert.equal(source.sha256,request[`${lane}Tree`]);
  return {commit,gitTree:git(root,['rev-parse','HEAD^{tree}']),source,fullTrackedCheckoutClean:true};
}
async function childLane(lane,env) {
  assert.equal(env.R35_DRAWER_CHILD,'1');assert.ok(['baseline','candidate'].includes(lane));
  const harness=resolve('.'),request=JSON.parse(await readFile('qa/drawer-compositing-request.json','utf8'));
  const target=validateDrawerRequest(request,env),output=resolve('drawer-compositing-results',target.name,lane);await mkdir(output,{recursive:true});
  const root=lane==='baseline'?resolve(harness,'../baseline-app'):harness;
  const identity=await verifyDrawerCheckout(root,lane,request,env);
  const row={lane,contract:drawerContract,harnessCommit:env.GITHUB_SHA,...identity,workload:await workloadIdentity(root),status:'running',openingActions:[],captures:[],pageErrors:[],console:[],runtimeBodies:[],errors:[],cleanup:{context:'not-started',browser:'not-started',server:'not-started'},
    scope:'Direct-entry NISMO then Premium using the unchanged real Drawer sequence. This setup differs from v1 homepage-to-drawer; it cannot relabel the earlier desktop stall. Trace spans the entire fixed action sequence including screenshots, scene setup and native inputs. Timings are descriptive software-runner observations, not isolated animation cost or physical-device FPS.'};
  const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(row,null,2));await save();
  const pin=bytes=>({sha256:sha256(bytes),bytes:bytes.length});const bundles=new Map([['/index.html',pin(await readFile(resolve(root,'dist/index.html')))]]);
  for(const name of await readdir(resolve(root,'dist/assets')))if(/\.(js|css)$/.test(name))bundles.set('/assets/'+name,pin(await readFile(resolve(root,'dist/assets',name))));
  const {chromium,expect}=await import('@playwright/test');const {createAppServer}=await import(pathToFileURL(resolve(root,'server.mjs')));
  let server,browser,context,page,receipts;
  try {
    server=createAppServer(resolve(root,'dist'));await new Promise((done,reject)=>{server.once('error',reject);server.listen(4189,'127.0.0.1',done);});
    browser=await chromium.launch({timeout:30000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
    context=await browser.newContext({viewport:target.viewport,deviceScaleFactor:1,reducedMotion:target.reducedMotion,serviceWorkers:'block'});
    page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(45000);
    page.on('pageerror',error=>row.pageErrors.push(String(error)));page.on('console',message=>{if(['error','warning'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
    receipts=createUiReceipts({page,origin:target.origin,pins:bundles,receipts:row.runtimeBodies});
    const drain=async()=>{try{return await receipts.drain();}finally{row.runtimeLedger=receipts.snapshot();await save();}};
    const navigate=async url=>{try{return await receipts.navigate(url);}finally{row.runtimeLedger=receipts.snapshot();await save();}};
    const shot=async label=>{
      const file=label+'.png',capture={label,file};assert.ok(row.captures.length<24);row.captures.push(capture);
      try {await recordDrawerCapture({capture,
        readStyles:()=>page.evaluate(()=>{const read=selector=>{const element=document.querySelector(selector);if(!element)return null;const s=getComputedStyle(element);return {background:s.backgroundColor,backdropFilter:s.backdropFilter,opacity:s.opacity,transform:s.transform};};return {pageTimeMs:performance.now(),sheet:read('.drawer'),backdrop:read('.drawer-backdrop')};}),
        screenshot:()=>page.screenshot({path:resolve(output,file),timeout:45000,animations:'allow',scale:'css'})
      });}finally {await save();}
    };
    const cdp=await context.newCDPSession(page);let sequenceError;
    const observedPage=observeOpeningClicks(page,row.openingActions);
    row.trace=await traceWindow(cdp,async()=>{try{await exerciseDrawer({page:observedPage,target,lane,row,shot,expect,drain,save,navigate});}catch(error){sequenceError=error;row.status='failed';row.errors.push({message:String(error),stack:error.stack});await save();}});
    row.openingObservations=(row.animationDiagnostics||[]).map((diagnostic,index)=>({action:row.openingActions[index],panel:diagnostic.panel,predicateStartMs:diagnostic.startedAt,predicateDurationMs:diagnostic.elapsedMs,predicateStatus:diagnostic.status,originalDeadlineMs:diagnostic.originalDeadlineMs,lastSample:diagnostic.samples.at(-1),scope:'Playwright click-return and CSS animation predicate observations use separate Node/page clocks; neither proves GPU/compositor completion.'}));
    await writeFile(resolve(output,'trace.json'),JSON.stringify({traceEvents:row.trace.events}));delete row.trace.events;
    if(sequenceError)throw sequenceError;
    await receipts.finish();row.runtimeLedger=receipts.snapshot();assert.deepEqual(row.pageErrors,[]);assert.deepEqual(row.drawerFailures,[],'Both v2 sources already require valid modal isolation');row.status='passed';
  }catch(error){row.status='failed';if(!row.errors.some(item=>item.message===String(error)))row.errors.push({message:String(error),stack:error.stack});}
  finally {
    if(receipts){row.runtimeLedger=receipts.snapshot();receipts.stop();}await save();
    for(const [name,resource,close] of [['context',context,()=>context.close()],['browser',browser,()=>browser.close()],['server',server,()=>{server.closeAllConnections();return new Promise(done=>server.close(done));}]]) {
      if(!resource){row.cleanup[name]='not-started';continue;}
      try{await bounded(close(),15000,`${name} cleanup`);row.cleanup[name]='passed';}catch(error){row.cleanup[name]='failed';row.status='failed';row.errors.push({message:String(error)});}await save();
    }
  }
  await save();return row.status==='passed'?0:1;
}
async function runLaneProcess(lane,target,deadline) {
  const output=resolve('drawer-compositing-results',target.name);await mkdir(output,{recursive:true});
  const budget=Math.min(8*60*1000,deadline-performance.now());assert.ok(budget>0,'Original sixteen-minute comparison window expired');
  const result=await new Promise(resolveResult=>{
    const child=spawn(process.execPath,[resolve('scripts/drawer-compositing-browser.mjs'),`--lane=${lane}`],{cwd:resolve('.'),env:{...process.env,R35_DRAWER_CHILD:'1'},stdio:['ignore','pipe','pipe'],detached:true});
    let stdout='',stderr='',timedOut=false,killTimer;
    child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-200000);});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-200000);});
    const kill=signal=>{try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')stderr+='\n'+String(error);}};
    const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),5000);},budget);
    child.once('error',error=>{clearTimeout(timer);clearTimeout(killTimer);resolveResult({exitCode:null,signal:null,timedOut,spawnError:String(error),stdout,stderr});});
    child.once('close',(exitCode,signal)=>{clearTimeout(timer);clearTimeout(killTimer);kill(timedOut?'SIGKILL':'SIGTERM');resolveResult({exitCode,signal,timedOut,stdout,stderr});});
  });
  await writeFile(resolve(output,`${lane}-stdout.log`),result.stdout);await writeFile(resolve(output,`${lane}-stderr.log`),result.stderr);delete result.stdout;delete result.stderr;
  let row;try{row=JSON.parse(await readFile(resolve(output,lane,'report.json'),'utf8'));}catch(error){row={lane,status:'failed',errors:[{message:`Missing terminal child report: ${error}`} ]};}
  result.ownershipRetired=ownershipRetired(result,row.cleanup);
  result.retirementEvidence=result.ownershipRetired?'Explicit successful context/browser/server closes and normal terminal child exit (0 or controlled functional failure 1)':'Unproven; killing the Node child/process group is not proof of browser retirement';
  row.process=result;if(result.exitCode!==0||result.timedOut||result.signal||result.spawnError)row.status='failed';return row;
}
export async function collectIndependentLanes(runLane,onRow) {
  const lanes=[];
  for(const lane of ['baseline','candidate']) {
    let row;try{row=await runLane(lane);}catch(error){row={lane,status:'failed',errors:[{message:String(error)}]};}
    lanes.push(row);await onRow(row);
  }
  return lanes;
}
export async function main(env=process.env) {
  assert.equal(env.R35_DRAWER_CHILD,undefined);
  const request=JSON.parse(await readFile('qa/drawer-compositing-request.json','utf8')),target=validateDrawerRequest(request,env);
  const output=resolve('drawer-compositing-results',target.name);await mkdir(output,{recursive:true});
  const report={contract:drawerContract,request,target,harnessCommit:env.GITHUB_SHA,status:'running',lanes:[],limitations:['New direct-entry v2 setup, not the prior homepage-to-drawer sequence. Original failed v1 verdicts remain unchanged.','Each source executes in a separate Node and browser process. A failed baseline never blocks independent candidate execution.','A single ordered pair including screenshots and scene setup cannot establish causal hardware speedup.','No comparison metrics are emitted unless both complete the identical drawer sequence and cleanup with exact body receipts.']};
  const save=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await save();
  const deadline=performance.now()+16*60*1000;
  await collectIndependentLanes(lane=>runLaneProcess(lane,target,deadline),async row=>{report.lanes.push(row);await save();});
  if(!report.lanes[0].process?.ownershipRetired)report.limitations.push('Baseline ownership retirement was not proved. Any independently completed candidate functional evidence cannot be used as a matched timing comparison.');
  report.assessment=assessDrawerLanes(report.lanes,request);report.status=report.assessment.status;
  if(report.assessment.comparable)report.metricComparison={scope:'Whole identical direct-entry drawer action sequence; includes screenshots, native inputs and scene setup',baseline:report.lanes[0].trace,candidate:report.lanes[1].trace};
  await save();assert.equal(report.status,'passed','Both exact v2 lanes and original cleanup must pass');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const argument=process.argv[2];
  if(argument===undefined)await main();
  else {assert.match(argument,/^--lane=(baseline|candidate)$/);const status=await childLane(argument.slice(7),process.env);process.exit(status);}
}
