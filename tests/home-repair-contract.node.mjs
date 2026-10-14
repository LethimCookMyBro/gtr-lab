import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {contract,baselineCommit,budgets,validateRequest,viewports,supplementaryViewports,inputIdentity,assessGate} from '../scripts/home-repair-policy.mjs';
import {holdOriginalRequest,bounded,rearCertificate,waitForHomePrefix} from '../scripts/home-repair-browser.mjs';
const request={version:1,allow:true,contract,baselineCommit,baselineTree:'a'.repeat(64),candidateTree:'b'.repeat(64),baselineInputs:'c'.repeat(64),candidateInputs:'d'.repeat(64)};
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'e'.repeat(40),R35_ALLOW_HOME_REPAIR:'1',R35_HOME_REPAIR_VIEWPORT:'mobile',R35_HOME_REPAIR_MESSAGE:'Reconstruct [stage-home-repair]'};
const source=()=>readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');
test('closed request permits only exact staged main pushes and four named dimensions',()=>{
 assert.deepEqual(viewports,{desktop:{width:1440,height:900},mobile:{width:390,height:844},tablet:{width:820,height:1180},landscape:{width:1024,height:768}});assert.deepEqual(supplementaryViewports,{narrow:{width:320,height:568},shortLandscape:{width:568,height:320}});
 for(const name of Object.keys(viewports))assert.equal(validateRequest(request,{...env,R35_HOME_REPAIR_VIEWPORT:name}).origin,'http://127.0.0.1:4189');
 for(const changed of [{allow:false},{version:2},{contract:'recovered-original'},{baselineCommit:'f'.repeat(40)},{candidateTree:request.baselineTree},{candidateTree:'0'.repeat(64)},{baselineInputs:'0'.repeat(64)},{url:'https://public.test'}])assert.throws(()=>validateRequest({...request,...changed},env));
 for(const changed of [{GITHUB_ACTIONS:undefined},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_SHA:baselineCommit},{R35_ALLOW_HOME_REPAIR:undefined},{R35_HOME_REPAIR_VIEWPORT:'narrow'},{R35_HOME_REPAIR_MESSAGE:'[release-home] [stage-home-repair]'},{R35_HOME_REPAIR_MESSAGE:'rebuild'},{PREVIEW_BASE_URL:'http://localhost:3000'},{R35_HOME_REPAIR_URL:'https://public.test'},{R35_HOME_REPAIR_ROOT:'/elsewhere'},{HOME_QA_URL:'http://localhost'}])assert.throws(()=>validateRequest(request,{...env,...changed}));
});
test('all original budgets remain exactly bounded',()=>assert.deepEqual(budgets,{initialPage:25000,nativeInitial:45000,nativeLater:30000,ready:90000,screenshot:45000,command:5000,cleanup:15000,body:15000,lane:300000}));
test('real gate proof requires decoded natural image, closed resolved gate, usable content, and pending car',()=>{
 const state={poster:'decoded',posterNaturalWidth:1920,gate:'resolved',gateOpen:false,inert:false,carHeld:true,scene:'loading'};assert.ok(Object.values(assessGate(state)).every(Boolean));
 for(const changed of [{poster:'loading'},{posterNaturalWidth:0},{gate:'loading'},{gateOpen:true},{inert:true},{carHeld:false},{scene:'ready'}])assert.ok(Object.values(assessGate({...state,...changed})).some(value=>!value));
});
test('held original requests continue once with no body fulfillment or second network request',async()=>{
 let handler,continues=0;const page={route:async(_url,fn)=>{handler=fn;}};const held=await holdOriginalRequest(page,'http://127.0.0.1:4189/models/ciasny-r35.glb');const run=handler({continue:async()=>{continues++;}});await held.wait();assert.equal(held.pending(),true);assert.equal(continues,0);await held.release();await held.release();await run;assert.equal(continues,1);assert.equal(held.snapshot().requests,1);assert.equal(held.snapshot().continued,true);
});
test('cleanup can release a not-yet-issued original request without granting a substitute',async()=>{
 let handler,continues=0;const held=await holdOriginalRequest({route:async(_url,fn)=>{handler=fn;}},'http://127.0.0.1:4189/local');await held.release();await handler({continue:async()=>{continues++;}});assert.equal(continues,1);assert.equal(held.pending(),false);
});
test('bounded promises preserve errors and reject at original deadline without retry',async()=>{
 const error=new Error('original native error');await assert.rejects(bounded(Promise.reject(error),20,'native'),e=>e===error);await assert.rejects(bounded(new Promise(()=>{}),2,'native'),/original 2ms deadline exceeded/);
});
test('preflight/import isolation, original response ledger, independent candidate, and no production writes are structural gates',async()=>{
 const text=await source();assert.ok(text.indexOf('await preflight(env,root)')<text.indexOf("await import('@playwright/test')"));assert.ok(text.indexOf('await verifyCheckout(laneRoot,lane,request,env)')<text.indexOf("await import(pathToFileURL(resolve(laneRoot,'server.mjs')))"));
 assert.match(text,/createUiReceipts\(\{page,origin:target.origin,pins,receipts:row.runtimeBodies\}\)/);assert.match(text,/const source=await sourceIdentity\(root\),inputs=await inputIdentity\(root\)/);assert.match(text,/git\(root,\['status','--porcelain','--untracked-files=no'\]\)/);
 assert.doesNotMatch(text,/fetch\(|route\.fulfill|request\.get\(|Network\.getResponseBody|gl\.finish\(|gl\.flush\(|setDefaultTimeout\(0\)|Object\.defineProperty\(document|dispatchEvent\(new.*visibility/);
 assert.doesNotMatch(text,/if\s*\(row.status\s*===?\s*['"]failed['"]\)\s*break/);assert.match(text,/for\(const lane of \['baseline','candidate'\]\)/);
 assert.match(text,/original lane deadline|Original lane deadline/);for(const label of ['Browser context cleanup','Browser cleanup','Server cleanup'])assert.ok(text.includes(label));
});
test('initial proof has one absolute25s window; provider identity and native framebuffer/capture brackets are explicit',async()=>{
 const text=await source();for(const fragment of ["const initialStarted=performance.now();await receipts.navigate(target.origin+'/');",'initialDeadline=initialStarted+budgets.initialPage','initialDeadline-performance.now()','Screenshots are separately timed captures','owner.documentHandle.evaluate(saved=>saved===document)','handle.evaluate(read)','main.defaultFramebufferCalls','Native GL work changed during PNG capture','Canvas progress/buffer changed during PNG capture']){
   if(fragment==='main.defaultFramebufferCalls')assert.ok(text.includes('frame.defaultFramebufferCalls>0'));else assert.ok(text.includes(fragment),fragment);
 }
 assert.match(text,/status:'partial',reason:'Native tab focus did not hide/);assert.match(text,/same native document|Same native document/);
});
test('staged workflow has read-only permissions, immutable baseline, independent failed baseline build, artifacts, and no release trigger',async()=>{
 const text=await readFile(new URL('../.github/workflows/home-repair-qa.yml',import.meta.url),'utf8');assert.match(text,/contents: read/);assert.match(text,/branches: \[main\]/);assert.match(text,/fail-fast: false/);assert.ok(text.includes(baselineCommit));assert.match(text,/!contains\(github.event.head_commit.message, '\[release-'\)/);assert.match(text,/Build immutable baseline production assets\n        continue-on-error: true/);assert.match(text,/if: always\(\)/);assert.match(text,/tests\/home-repair-gpu-observer.node.mjs/);assert.doesNotMatch(text,/workflow_dispatch|railway|git push|release-marker.json/);
});

test('native main certificate permits later offscreen drains but rejects default-buffer changes, incomplete fences, or shifted pixels',()=>{
 const main={id:1,contextId:1,status:'signaled',callbackReturned:true,defaultFramebufferCalls:4,defaultFramebufferMutations:5,defaultFramebufferRevision:5,rearProgress:'0.9200',bufferWidth:390,bufferHeight:844};
 const drain={...main,id:2,defaultFramebufferCalls:0,defaultFramebufferMutations:0};
 const context={id:1,sceneCanvas:true,connected:true,lastFenceId:2,pendingObservedFrames:0,defaultFramebufferRevision:5,workRevision:7,lastFenceWorkRevision:7};
 const state={issues:[],frames:[main,drain],contexts:[context]},canvas={progress:'0.9200',width:390,height:844};
 assert.equal(rearCertificate(state,canvas,.92).main.id,1);assert.equal(rearCertificate(state,canvas,.92).drain.id,2);
 for(const mutate of [s=>s.contexts[0].defaultFramebufferRevision++,s=>s.frames[1].status='pending',s=>s.contexts[0].workRevision++,s=>s.contexts.push({...context,id:2}),s=>s.frames[0].bufferWidth=391,s=>s.frames[0].rearProgress='0.5']){const changed=structuredClone(state);mutate(changed);assert.equal(rearCertificate(changed,canvas,.92),null);}
 assert.equal(rearCertificate(state,{...canvas,progress:'0.5'},.92),null);assert.throws(()=>rearCertificate({...state,issues:['native context lost']},canvas,.92),/native context lost/);
});

test('a clean current-prefix checkpoint drains legitimate late work without inventing a new main draw',()=>{
 const main={id:1,contextId:1,status:'signaled',callbackReturned:true,defaultFramebufferCalls:3,defaultFramebufferRevision:3,rearProgress:'0.5000',bufferWidth:390,bufferHeight:844};
 const context={id:1,sceneCanvas:true,connected:true,lastFenceId:1,pendingObservedFrames:0,defaultFramebufferRevision:3,workRevision:8,lastFenceWorkRevision:7};
 const state={issues:[],frames:[main],checkpoints:[],contexts:[context]},canvas={progress:'0.5000',width:390,height:844};assert.equal(rearCertificate(state,canvas,.5),null);
 state.checkpoints.push({id:1,kind:'checkpoint',contextId:1,status:'signaled',stale:false,workRevision:8,bufferWidth:390,bufferHeight:844});assert.equal(rearCertificate(state,canvas,.5).main.id,1);assert.equal(rearCertificate(state,canvas,.5).drain.kind,'checkpoint');
 state.checkpoints[0].stale=true;assert.equal(rearCertificate(state,canvas,.5),null);state.checkpoints[0].stale=false;state.contexts[0].defaultFramebufferRevision++;assert.equal(rearCertificate(state,canvas,.5),null);
});
test('native-prefix checkpoint retry is capped at four with one unchanged absolute45/30s deadline',async()=>{
 for(const staleCount of [0,3,4]){let time=0,created=0;const main={id:1,contextId:1,status:'signaled',callbackReturned:true,defaultFramebufferCalls:3,defaultFramebufferRevision:3,rearProgress:'0.5000',bufferWidth:390,bufferHeight:844};const state={stopped:false,issues:[],frames:[main],checkpoints:[],pendingObservedFrames:0,contexts:[{id:1,sceneCanvas:true,connected:true,lastFenceId:1,pendingObservedFrames:0,defaultFramebufferRevision:3,workRevision:8,lastFenceWorkRevision:7}]};
 const args={progress:.5,timeout:30000,now:()=>time,pause:async ms=>{time+=ms;},read:async()=>({observation:structuredClone(state),canvas:{progress:'0.5000',width:390,height:844}}),checkpoint:async gate=>{created++;const cp={id:created,gate,kind:'checkpoint',contextId:1,stale:created<=staleCount,status:'signaled',workRevision:state.contexts[0].workRevision,bufferWidth:390,bufferHeight:844};state.checkpoints.push(cp);if(cp.stale)state.contexts[0].workRevision++;return cp;}};
 if(staleCount===4){await assert.rejects(waitForHomePrefix(args),/four attempts/);assert.equal(created,4);}else{const proof=await waitForHomePrefix(args);assert.equal(proof.main.id,1);assert.equal(proof.window.attempts,staleCount+1);assert.equal(proof.window.deadline,30000);}
 }
 let time=0;await assert.rejects(waitForHomePrefix({progress:.08,timeout:45000,now:()=>time,read:async()=>({observation:{stopped:false,issues:[],frames:[],checkpoints:[],contexts:[]},canvas:null}),checkpoint:async()=>{throw new Error('must not checkpoint without actual main');},pause:async ms=>{time+=ms;}}),/45000ms/);assert.equal(time,45000);
});
