import test from 'node:test';
import assert from 'node:assert/strict';
import { validateComparisonEnvironment, assertSourcePair } from '../scripts/cabin-leather-comparison-policy.mjs';
import { readFile } from 'node:fs/promises';
const request = JSON.parse(await readFile(new URL('../qa/cabin-leather-comparison-request.json', import.meta.url)));
const env = { CI:'true', GITHUB_ACTIONS:'true', GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'push', GITHUB_SHA:'a'.repeat(40), R35_LEATHER_COMMIT_MESSAGE:'[stage-cabin-leather-comparison]', R35_LEATHER_LANE:'baseline', R35_QA_VIEWPORT:'desktop' };
test('closed request is valid for source-only review while disabled', () => { assertSourcePair(request); });
test('disabled request cannot launch any browser or server', () => { assert.throws(() => validateComparisonEnvironment(env,{...request,allow:false}), /disabled/); });
for (const [key,value] of Object.entries({ GITHUB_ACTIONS:'false', GITHUB_REPOSITORY:'other/repo', GITHUB_REF:'refs/heads/other', GITHUB_EVENT_NAME:'workflow_dispatch', R35_LEATHER_LANE:'other', R35_QA_VIEWPORT:'other', R35_BASE_URL:'http://evil', R35_MAX_BUFFER_PIXELS:'1000000', R35_CAPTURE_TIMEOUT:'180000' })) {
  test(`reject ${key} override`, () => { assert.throws(() => validateComparisonEnvironment({...env,[key]:value},request)); });
}
test('baseline source cannot drift under the new comparison contract',()=>{const altered=structuredClone(request);altered.baseline.source.sha256='b'.repeat(64);assert.throws(()=>assertSourcePair(altered));});

import { sha256, baselineCommit, previewPath, budgets, comparisonSettings, helperPaths, buildPaths, assertPreviewSelection, inspectMaterialModel, assertNativeCertificate, assertMatchedPair, verifyFilePins } from '../scripts/cabin-leather-comparison-policy.mjs';
const candidateModel={path:'/models/r35-cabin-contact-ao-static-faces-leather-da354db8.glb',bytes:20195752,sha256:'da354db8b3d40bc569e68262d121cc630f9bdf293c10b40071b6b46b0370b06a',gzipBytes:10194086,gzipSha256:'9fa0fc0b8eb05287e08e54bef81936954e91665f9e34fe95a7c9002aaf33e817'};
function enabledRequest(){const r=structuredClone(request);r.allow=true;r.candidate={commit:'current',source:structuredClone(r.baseline.source),model:candidateModel,buildFiles:Object.fromEntries(buildPaths.candidate.map(p=>[p,'a'.repeat(64)]))};r.candidate.source.files.find(f=>f.path===previewPath).sha256='b'.repeat(64);r.candidate.source.sha256=sha256(JSON.stringify(r.candidate.source.files));r.baseline.buildFiles=Object.fromEntries(buildPaths.baseline.map(p=>[p,'a'.repeat(64)]));r.helperPins=Object.fromEntries(helperPaths.map(p=>[p,'a'.repeat(64)]));return r;}
test('enabled lanes use fixed baseline or current candidate commit and identical quality geometry',()=>{const r=enabledRequest();const a=validateComparisonEnvironment(env,r),b=validateComparisonEnvironment({...env,R35_LEATHER_LANE:'candidate'},r);assert.equal(a.commit,baselineCommit);assert.equal(b.commit,env.GITHUB_SHA);assert.deepEqual(a.viewport,b.viewport);assert.equal(a.deviceScaleFactor,2);assert.equal(validateComparisonEnvironment({...env,R35_QA_VIEWPORT:'mobile'},r).deviceScaleFactor,3);});
for(const [key,value] of Object.entries({CI:'false',R35_LEATHER_COMMIT_MESSAGE:'',R35_CABIN_URL:'https://example.org/model.glb',R35_PREPARATION_QUALITY:'reduced'}))test(`enabled request rejects ${key}`,()=>assert.throws(()=>validateComparisonEnvironment({...env,[key]:value},enabledRequest())));
test('no other runtime file can be repinned as material-only',()=>{const r=enabledRequest();r.candidate.source.files.find(f=>f.path==='src/components/three/StudioLighting.tsx').sha256='c'.repeat(64);r.candidate.source.sha256=sha256(JSON.stringify(r.candidate.source.files));assert.throws(()=>assertSourcePair(r),/Only the ordinary/);});
test('helper closure cannot omit or add executable files',async()=>{await assert.rejects(verifyFilePins('.',{},helperPaths));await assert.rejects(verifyFilePins('.',{'scripts/unreviewed.mjs':'a'.repeat(64)},helperPaths));});
function native(seat='driver'){
 const ratio=Math.min(2,1.5,Math.sqrt(2000000/(1440*744)));
 const snapshot={live:true,camera:{settled:true,preset:'interior',requestId:1},vehicle:{environment:'studio',environmentRequest:0,lights:false,cabinSeat:seat,exterior:true,full:seat!==null,proxy:false},dimensions:{cssWidth:1440,renderWidth:1440,cssHeight:744,renderHeight:744,pixelRatio:ratio,width:1967,height:1016},pose:{position:[1,2,3],quaternion:[0,0,0,1],projection:Array(16).fill(0)}};
 const certificate={owner:1,mainDrawId:2,fenceId:3,drainFenceId:4,nativeStatus:0x911a,drainNativeStatus:0x911c,reusedUnchanged:false,armedAt:0,readyAt:6,snapshot};
 const observation={issues:[],events:[{kind:'main',owner:1,id:2,at:1,stable:true,snapshot},{kind:'fence',owner:1,id:3,at:2,draws:[2]},{kind:'wait',owner:1,id:3,at:3,status:0x911a},{kind:'fence',owner:1,id:4,at:4,draws:[]},{kind:'wait',owner:1,id:4,at:5,status:0x911c}]};return{certificate,observation};
}
test('complete stable native main and drain certificate qualifies',()=>{const n=native();assertNativeCertificate(n.certificate,n.observation,{name:'desktop',deviceScaleFactor:2},'driver');});
for(const kind of ['main','fence','wait'])test(`missing actual ${kind} cannot qualify`,()=>{const n=native();n.observation.events=n.observation.events.filter(e=>e.kind!==kind);assert.throws(()=>assertNativeCertificate(n.certificate,n.observation,{name:'desktop',deviceScaleFactor:2},'driver'));});
for(const mutate of [n=>n.certificate.reusedUnchanged=true,n=>n.certificate.nativeStatus=0x911b,n=>n.observation.events[0].stable=false,n=>n.observation.events[1].draws=[],n=>n.observation.events.at(-1).at=7,n=>n.certificate.snapshot.vehicle.lights=true,n=>n.certificate.snapshot.dimensions.pixelRatio=1])test('invalid native completion/settings cannot qualify',()=>{const n=native();mutate(n);assert.throws(()=>assertNativeCertificate(n.certificate,n.observation,{name:'desktop',deviceScaleFactor:2},'driver'));});
function reports(){const r=enabledRequest(),rows=['baseline','candidate'].map(lane=>{const first=native('driver'),second=native('passenger');second.certificate.mainDrawId=6;second.certificate.fenceId=7;second.certificate.drainFenceId=8;second.certificate.readyAt=16;for(const e of second.observation.events){e.at+=10;e.id+=4;if(e.draws)e.draws=e.draws.map(v=>v+4);}const bitmapIds=Array.from({length:11},(_,i)=>i+1);return{result:'passed',lane,contract:r.contract,source:r[lane].source,model:r[lane].model,budgets,quality:'standard',viewport:'desktop',harnessCommit:env.GITHUB_SHA,sourceCommit:lane==='baseline'?baselineCommit:env.GITHUB_SHA,settings:comparisonSettings('desktop'),errors:[],pageErrors:[],console:[],cleanup:{receipts:'passed',context:'closed',browser:'closed',server:'closed'},runtimeBodyLedger:{state:'finished',errors:[],lateEvents:[],requests:[{requestId:28,generation:1,url:'http://127.0.0.1:4178'+r[lane].model.path,path:r[lane].model.path,status:200,sha256:r[lane].model.sha256,bytes:r[lane].model.bytes,state:'body-completed'}]},nativeModelReceipt:receiptFixture(r[lane].model),residentCohort:{bitmapIds,textureIds:[1]},resources:{issues:[],pendingBitmapDecodes:0,pendingIdentities:0,bitmaps:bitmapIds.map(id=>({id,closeCalls:1})),textures:[{id:1,bitmapIds,deleteCalls:1,deletedWhileLive:true}]},resourceRetirement:{closedBitmapIds:bitmapIds,deletedTextureIds:[1]},material:{images:Array.from({length:11},(_,i)=>({name:'image-'+i,sha256:'a'.repeat(64),bytes:10})),changes:lane==='candidate'?[0,10,13,32,34,35].map(index=>({index,before:.55,after:.35})):[],binarySha256:'a',normalizedDocumentSha256:'b'},observation:{issues:[],events:[...first.observation.events,...second.observation.events]},captures:[['driver',first],['passenger',second]].map(([label,n])=>({label,file:label+'.png',sha256:'c'.repeat(64),certificate:n.certificate,bounds:{x:0,y:100,width:1440,height:744},renderer:{renderer:'SwiftShader',antialias:true,samples:4,sampleBuffers:1}}))};});return{r,rows};}
test('exact independent lane evidence permits a matched pair',()=>{const {r,rows}=reports();assert.equal(assertMatchedPair(...rows,r).matched,true);});
for(const change of [row=>row.result='failed',row=>row.captures[0].certificate.snapshot.pose.position[0]=99,row=>row.captures[0].renderer.samples=0,row=>row.model={...row.model,sha256:'b'.repeat(64)},row=>row.resources.bitmaps[0].closeCalls=0,row=>row.budgets={...budgets,functional:40000},row=>row.cleanup.context='open'])test('unmatched/failed/deadline-widened or leaked evidence cannot become a matched pair',()=>{const {r,rows}=reports();change(rows[1]);assert.throws(()=>assertMatchedPair(...rows,r));});

test('both lanes disabling MSAA cannot qualify together',()=>{const {r,rows}=reports();for(const row of rows)row.captures[0].renderer.samples=0;assert.throws(()=>assertMatchedPair(...rows,r));});

test('shared HDR or texture change cannot qualify as a leather-only pair',()=>{const {r,rows}=reports();for(const [i,row] of rows.entries())row.runtimeBodyLedger.requests.push({path:'/environments/studio.hdr',status:200,bytes:42,sha256:(i?'d':'c').repeat(64),state:'body-completed'});assert.throws(()=>assertMatchedPair(...rows,r),/actually requested/);});

test('both lanes dropping image identities cannot qualify together',()=>{const {r,rows}=reports();for(const row of rows)row.material.images=[];assert.throws(()=>assertMatchedPair(...rows,r));});

// Removing the post-install dependency link must reproduce the two-checkout CI failure.
// The on-disk package exercises Node's actual resolver before CI installs npm packages.
// CI additionally imports the unchanged full collector against the real installed package.
import { mkdtemp, mkdir, writeFile, rm, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('two-checkout ESM createRequire resolves the app install only after the workflow link', async () => {
  const root=await mkdtemp(join(tmpdir(),'r35-leather-two-roots-'));
  try {
    await mkdir(join(root,'app/node_modules/playwright-core/lib'),{recursive:true});
    await mkdir(join(root,'harness/scripts'),{recursive:true});
    await writeFile(join(root,'app/node_modules/playwright-core/package.json'),JSON.stringify({name:'playwright-core',type:'commonjs',exports:{'./lib/utilsBundle':'./lib/utilsBundle.js'}}));
    await writeFile(join(root,'app/node_modules/playwright-core/lib/utilsBundle.js'),'exports.PNG = { resolverFixture: "verified-app-install" };\n');
    const helper=join(root,'harness/scripts/environment-pixel-comparison.mjs');
    await writeFile(helper,'import assert from "node:assert/strict"; import {createRequire} from "node:module"; const {PNG}=createRequire(import.meta.url)("playwright-core/lib/utilsBundle"); assert.equal(PNG.resolverFixture,"verified-app-install"); console.log("resolved verified app install");\n');
    const env={...process.env,NODE_PATH:''};
    const run=()=>spawnSync(process.execPath,[...process.execArgv.filter(v=>v!=='--test'),helper],{cwd:root,env,encoding:'utf8',timeout:15000});
    const before=run();assert.notEqual(before.status,0);assert.match(before.stderr,/Cannot find module 'playwright-core\/lib\/utilsBundle'/);
    const workflow=await readFile(new URL('../.github/workflows/cabin-leather-comparison.yml',import.meta.url),'utf8');
    const commands=workflow.split('\n').map(line=>line.trim()).filter(line=>line.startsWith('ln -s '));
    assert.deepEqual(commands,['ln -s ../app/node_modules harness/node_modules'],'The verified app dependency link is missing');
    const afterInstall=workflow.indexOf('run: npm ci'),linkAt=workflow.indexOf(commands[0]),captureAt=workflow.indexOf('run: node harness/scripts/collect-cabin-leather-comparison.mjs app');
    assert.ok(afterInstall>=0&&linkAt>afterInstall&&captureAt>linkAt,'Dependency link must follow npm ci and precede collector execution');
    const link=spawnSync('sh',['-eu','-c',commands[0]],{cwd:root,env,encoding:'utf8',timeout:15000});assert.equal(link.status,0,link.stderr);
    assert.equal(await readlink(join(root,'harness/node_modules')),'../app/node_modules');
    const after=run();assert.equal(after.status,0,after.stderr);assert.match(after.stdout,/resolved verified app install/);
  }finally{await rm(root,{recursive:true,force:true});}
});

import { EventEmitter } from 'node:events';
import { captureActualComparisonCabinResponse, assertComparisonModelReceipt } from '../scripts/cabin-leather-model-body.mjs';
const bodyBytes=Buffer.from('Exact real-response fixture bytes');
const bodyPin={path:'/models/r35-cabin-fixture.glb',bytes:bodyBytes.length,sha256:sha256(bodyBytes),gzipBytes:24,gzipSha256:'a'.repeat(64)};
const origin='http://127.0.0.1:4178';
class NativeBodySession extends EventEmitter {
  commands=[];response={body:bodyBytes.toString('base64'),base64Encoded:true};failure=null;
  async send(method,params){this.commands.push({method,params});if(method==='Network.getResponseBody'){if(this.failure)throw this.failure;return this.response;}return{};}
}
const nativeRequest=(cdp,id='native-28',extra={})=>cdp.emit('Network.requestWillBeSent',{requestId:id,request:{url:origin+bodyPin.path,method:'GET'},...extra});
const nativeResponse=(cdp,id='native-28',extra={})=>cdp.emit('Network.responseReceived',{requestId:id,response:{url:origin+bodyPin.path,status:200,headers:{'content-encoding':'gzip','content-length':String(bodyPin.gzipBytes)},...extra}});
const finishNative=(cdp,id='native-28')=>cdp.emit('Network.loadingFinished',{requestId:id,encodedDataLength:42});
const pwRequest={requestId:28,generation:1,url:origin+bodyPin.path,method:'GET'};
const pwResponse={requestId:28,generation:1,url:origin+bodyPin.path,status:200};
const ledgerRows=()=>[{requestId:28,generation:1,url:origin+bodyPin.path,path:bodyPin.path,status:200,state:'body-completed',bytes:bodyPin.bytes,sha256:bodyPin.sha256}];
async function recorderFixture(){const cdp=new NativeBodySession();const observer=await captureActualComparisonCabinResponse({cdp,model:bodyPin,baseUrl:origin,phase:()=> 'initial'});observer.bindRequest(pwRequest);nativeRequest(cdp);nativeResponse(cdp);return{cdp,observer};}
test('same-session native body supplies exact bytes and correlated ledger identity',async()=>{const {cdp,observer}=await recorderFixture();const pending=observer.readBody(pwResponse);finishNative(cdp);assert.equal((await pending).equals(bodyBytes),true);assert.deepEqual(cdp.commands,[{method:'Network.enable',params:{maxResourceBufferSize:32*1024*1024,maxTotalBufferSize:128*1024*1024}},{method:'Network.setCacheDisabled',params:{cacheDisabled:true}},{method:'Network.getResponseBody',params:{requestId:'native-28'}}]);assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows());});
for(const [name,change] of [
 ['native body error',cdp=>{cdp.failure=new Error('inspector cache evicted');}],
 ['wrong bytes',cdp=>{cdp.response={body:Buffer.alloc(bodyPin.bytes,7).toString('base64'),base64Encoded:true};}],
 ['text encoding',cdp=>{cdp.response.base64Encoded=false;}],
 ['wrong body length',cdp=>{cdp.response.body='eA==';}],
])test('model receipt fails closed on '+name,async()=>{const {cdp,observer}=await recorderFixture();change(cdp);const pending=observer.readBody(pwResponse);finishNative(cdp);await assert.rejects(pending);assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));});
test('model receipt cannot fabricate correlation for an unrelated Playwright request',async()=>{const {cdp,observer}=await recorderFixture();assert.throws(()=>observer.readBody({...pwResponse,requestId:29}));finishNative(cdp);assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));});
test('second actual model request poisons the evidence instead of reusing an earlier body',async()=>{const {cdp,observer}=await recorderFixture();const pending=observer.readBody(pwResponse);nativeRequest(cdp,'native-29');finishNative(cdp);await assert.rejects(pending);assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));});
test('native redirect and unbound response cannot qualify',async()=>{for(const broken of ['redirect','unbound']){const cdp=new NativeBodySession(),observer=await captureActualComparisonCabinResponse({cdp,model:bodyPin,baseUrl:origin,phase:()=> 'initial'});observer.bindRequest(pwRequest);if(broken==='redirect')nativeRequest(cdp,'native-28',{redirectResponse:{status:302}});else nativeResponse(cdp,'orphan');await assert.rejects(observer.readBody(pwResponse));assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));}});
test('cached or failed native model is not an exact network body receipt',async()=>{for(const broken of ['cached','failed']){const cdp=new NativeBodySession(),observer=await captureActualComparisonCabinResponse({cdp,model:bodyPin,baseUrl:origin,phase:()=> 'initial'});observer.bindRequest(pwRequest);nativeRequest(cdp);if(broken==='cached')nativeResponse(cdp,'native-28',{fromDiskCache:true});else cdp.emit('Network.loadingFailed',{requestId:'native-28',errorText:'net::ERR_ABORTED'});await assert.rejects(observer.readBody(pwResponse));assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));}});
test('late duplicate native completion is retained as failure after bytes were read',async()=>{const {cdp,observer}=await recorderFixture();const pending=observer.readBody(pwResponse);finishNative(cdp);await pending;finishNative(cdp);assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));});

test('matched pair rejects absent same-session model receipt',()=>{const {r,rows}=reports();delete rows[1].nativeModelReceipt;assert.throws(()=>assertMatchedPair(...rows,r));});

function receiptFixture(model){return{version:1,buffers:{maxResourceBufferSize:32*1024*1024,maxTotalBufferSize:128*1024*1024},baseUrl:'http://127.0.0.1:4178',model:{...model},errors:[],native:{requestId:'native-28',url:'http://127.0.0.1:4178'+model.path,method:'GET',status:200,cached:false,terminal:'finished',requestSequence:1,responseSequence:2,finishedSequence:3,encodedTotalBytes:model.gzipBytes+100,headers:{'content-encoding':'gzip','content-length':String(model.gzipBytes)}},playwright:{requestId:28,generation:1,url:'http://127.0.0.1:4178'+model.path,method:'GET',status:200,bodyRequested:true},body:{nativeRequestId:'native-28',source:'CDP.Network.getResponseBody',base64Encoded:true,bytes:model.bytes,sha256:model.sha256,completedSequence:4}};}

import { createRuntimeBodyLedger } from '../scripts/cabin-runtime-body-ledger.mjs';
import { readinessWindow } from '../scripts/cabin-preparation-policy.mjs';
test('native completion may precede Playwright binding without a fabricated or repeated read',async()=>{
  const cdp=new NativeBodySession(),observer=await captureActualComparisonCabinResponse({cdp,model:bodyPin,baseUrl:origin,phase:()=> 'initial'});
  nativeRequest(cdp);nativeResponse(cdp);finishNative(cdp);await Promise.resolve();
  assert.ok(observer.snapshot().body);assert.equal(observer.snapshot().playwright,null);
  observer.bindRequest(pwRequest);assert.equal((await observer.readBody(pwResponse)).equals(bodyBytes),true);
  assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows());assert.equal(cdp.commands.filter(c=>c.method==='Network.getResponseBody').length,1);
});
for(const [name,mutate] of [
 ['wrong generation',r=>({...r,generation:2})],['wrong response URL',r=>({...r,url:origin+'/models/other.glb'})],['wrong status',r=>({...r,status:206})],
])test('body binding rejects '+name,async()=>{const {observer}=await recorderFixture();assert.throws(()=>observer.readBody(mutate(pwResponse)));assert.ok(observer.snapshot().errors.length);});
for(const headers of [{'content-encoding':'identity','content-length':String(bodyPin.gzipBytes)},{'content-encoding':'gzip','content-length':'25'}])test('native response rejects incorrect encoding or compressed byte count',async()=>{
  const cdp=new NativeBodySession(),observer=await captureActualComparisonCabinResponse({cdp,model:bodyPin,baseUrl:origin,phase:()=> 'initial'});observer.bindRequest(pwRequest);nativeRequest(cdp);nativeResponse(cdp,'native-28',{headers});await assert.rejects(observer.readBody(pwResponse));assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));
});
test('same-path foreign origin cannot own the model body',async()=>{
 const cdp=new NativeBodySession(),observer=await captureActualComparisonCabinResponse({cdp,model:bodyPin,baseUrl:origin,phase:()=> 'initial'});observer.bindRequest(pwRequest);nativeRequest(cdp,'native-28',{request:{url:'http://foreign.example'+bodyPin.path,method:'GET'}});await assert.rejects(observer.readBody(pwResponse));assert.equal(cdp.commands.some(c=>c.method==='Network.getResponseBody'),false);
});
function receiptLedger(observer,{now=()=>1000,setTimer,clearTimer}={}){
 const ledger=createRuntimeBodyLedger({intendedAssets:new Map([[bodyPin.path,{bytes:bodyPin.bytes,sha256:bodyPin.sha256}]]),now,...(setTimer?{setTimer,clearTimer}:{})});
 ledger.beginDocument(1);ledger.issue({...pwRequest,path:bodyPin.path,phase:'initial',startedAt:0});
 const task=ledger.receive({...pwResponse,body:()=>observer.readBody(pwResponse)});return{ledger,task};
}
test('missing native completion uses the unchanged original cleanup deadline and late completion cannot rescue it',async()=>{
 const {cdp,observer}=await recorderFixture();let now=1000,timer,delay;
 const {ledger,task}=receiptLedger(observer,{now:()=>now,setTimer:(fn,ms)=>{timer=fn;delay=ms;return 1;},clearTimer:()=>{}});
 const window=readinessWindow(budgets.lifecycle,now),pending=ledger.finish({window});assert.equal(delay,30000);assert.equal(ledger.snapshot().requests[0].state,'receiving');
 now=window.deadline;timer();await assert.rejects(pending,/Original readiness deadline exceeded/);
 const failed=ledger.snapshot();assert.equal(failed.state,'failed');assert.equal(failed.drains[0].state,'failed');assert.deepEqual(failed.drains[0].readinessWindow,window);assert.deepEqual(failed.errors[0].requestIds,[28]);assert.equal(failed.requests[0].state,'error');
 finishNative(cdp);await task;const late=ledger.snapshot();assert.equal(late.state,'failed');assert.equal(late.requests[0].state,'error');assert.equal(late.lateEvents[0].kind,'late-body-completed');assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,late.requests));
});
test('native body failure remains the original ledger error in the final failed snapshot',async()=>{
 const {cdp,observer}=await recorderFixture();cdp.failure=new Error('Network.getResponseBody: Request content was evicted from inspector cache');const {ledger,task}=receiptLedger(observer);finishNative(cdp);await task;
 await assert.rejects(ledger.finish({window:readinessWindow(budgets.lifecycle,1000)}),/original request errors remain/);
 const failed=ledger.snapshot();assert.equal(failed.state,'failed');assert.equal(failed.drains[0].state,'failed');assert.match(failed.requests[0].error,/evicted from inspector cache/);assert.equal(failed.requests[0].bytes,undefined);assert.equal(failed.errors[0].error,failed.requests[0].error);assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,failed.requests));
});
test('successful ledger followed by late native failure is still rejected at final receipt validation',async()=>{
 const {cdp,observer}=await recorderFixture(),{ledger,task}=receiptLedger(observer);finishNative(cdp);await task;await ledger.finish({window:readinessWindow(budgets.lifecycle,1000)});
 assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledger.snapshot().requests);cdp.emit('Network.loadingFailed',{requestId:'native-28',errorText:'late invalid terminal'});assert.equal(ledger.snapshot().state,'finished');assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledger.snapshot().requests));
});
test('an owned native request ID reused for a different URL cannot silently retain its earlier body',async()=>{
 const {cdp,observer}=await recorderFixture();const body=observer.readBody(pwResponse);finishNative(cdp);await body;
 nativeRequest(cdp,'native-28',{request:{url:origin+'/models/other.glb',method:'GET'},redirectResponse:{status:302}});
 assert.throws(()=>assertComparisonModelReceipt(observer.snapshot(),bodyPin,ledgerRows()));
});
