import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {nativeSeek,sectionTarget,waitForAudioProof,waitForRouteExit,observeRouteExit,observeRouteAction} from '../scripts/home-repair-browser.mjs';
import {assessAudio} from '../scripts/home-repair-policy.mjs';

// Exact source6 clock/sample values from b229 mobile candidate. These compact
// facts preserve the failed report; they do not invent a browser/audio execution.
const before={contexts:[{id:1,currentTime:35.590385487528344}]};
const after={contexts:[{id:1,currentTime:35.590385487528344}],events:[
 {kind:'resume',at:37733.5,contextId:1,trustedGesture:true,userActivation:true,sequence:36},
 {kind:'start',at:37734.5,contextId:1,nodeId:6,bufferDuration:7.600566893424037,sequence:39},
],edges:[{from:6,to:7,fromKind:'source',toKind:'gain',active:true},{from:7,to:1,fromKind:'gain',toKind:'destination',active:true}],samples:[
 {at:37738.20000000001,contextId:1,contextTime:35.590385487528344,gainNodeId:7,connectedToDestination:true,peak:1.4715870975123835e-6,rms:4.1162254344417607e-7,sequence:40},
 {at:37745,contextId:1,contextTime:35.590385487528344,gainNodeId:7,connectedToDestination:true,peak:1.4715870975123835e-6,rms:4.1162254344417607e-7,sequence:41},
 {at:37747.399999999965,contextId:1,contextTime:35.590385487528344,gainNodeId:7,connectedToDestination:true,peak:1.4715870975123835e-6,rms:4.1162254344417607e-7,sequence:42},
]};
test('b229 samples-only predicate passes before the required native context clock advances',async()=>{
 const oldReady=after.edges.some(edge=>edge.active&&edge.fromKind==='source'&&after.samples.some(sample=>sample.gainNodeId===edge.to&&sample.peak>1e-7&&sample.connectedToDestination));assert.equal(oldReady,true);assert.equal(assessAudio(before,after).passed,false);assert.equal(assessAudio(before,after).clockAdvanced,false);
 let time=0,reads=0;const result=await waitForAudioProof({before,read:async()=>{reads++;const value=structuredClone(after);if(reads>1)value.contexts[0].currentTime+=.01;return value;},pause:async ms=>{time+=ms;},now:()=>time});assert.equal(reads,2);assert.equal(result.proof.passed,true);assert.equal(result.window.budget,25000);assert.equal(time,100);
});
test('full playback predicate still rejects untrusted resume, wrong source/gain and silent output',()=>{
 for(const mutate of [state=>state.events[0].trustedGesture=false,state=>state.samples.forEach(sample=>sample.peak=0),state=>state.samples.forEach(sample=>sample.gainNodeId=999),state=>state.edges[1].active=false]){const state=structuredClone(after);state.contexts[0].currentTime+=.01;mutate(state);assert.equal(assessAudio(before,state).passed,false);}
});
function geometryPage({sectionTop=10000,sectionHeight=1000,childHeight=100,position='static',viewport=1180,documentHeight=11200}={}){
 let y=0,time=0,wheels=0;const child={getBoundingClientRect:()=>({height:childHeight})},element={firstElementChild:child,getBoundingClientRect:()=>({top:sectionTop-y,height:sectionHeight})};
 const sandbox={document:{documentElement:{scrollHeight:documentHeight}},innerHeight:viewport,getComputedStyle:()=>({position}),get scrollY(){return y;},Math};vm.createContext(sandbox);
 return {page:{locator:()=>({evaluate:async(fn,arg)=>{sandbox.element=element;sandbox.arg=arg;return vm.runInContext(`(${fn.toString()})(element,arg)`,sandbox);}}),evaluate:async fn=>vm.runInContext(`(${fn.toString()})()`,sandbox),mouse:{move:async()=>{},wheel:async(_x,delta)=>{wheels++;y=Math.min(documentHeight-viewport,Math.max(0,y+delta));}},waitForTimeout:async ms=>{time+=ms;}},get time(){return time;},get y(){return y;},get wheels(){return wheels;}};
}
test('nonsticky terminal section never receives fictitious sticky-runway midpoint progress',async()=>{
 const terminal=geometryPage();const target=await sectionTarget(terminal.page,'#home-lineup');assert.equal(target,10000);
 const oldTarget=10000+(1000-100)*.5,maxScroll=11200-1180;assert.ok(oldTarget>maxScroll,'Frozen formula asks browser for an unreachable position');
 const result=await nativeSeek(terminal.page,target,45000,()=>terminal.time);assert.equal(result.actualY,10000);assert.equal(result.clamped,false);assert.ok(terminal.time<45000);
 const sticky=geometryPage({position:'sticky'});assert.equal(await sectionTarget(sticky.page,'.home-signature-runway',.92),10828);
});
test('native scroll records terminal clamp honestly without timeout extension or forced scroll',async()=>{
 const fixture=geometryPage();const result=await nativeSeek(fixture.page,10450,45000,()=>fixture.time);assert.deepEqual(result,{requestedTarget:10450,reachableTarget:10020,maxScrollY:10020,actualY:10020,clamped:true});assert.ok(fixture.wheels>0);assert.ok(fixture.time<45000);
});
test('unreachable native wheel due to unchanged browser scroll still fails within the same original window',async()=>{
 const fixture=geometryPage();fixture.page.mouse.wheel=async()=>{};await assert.rejects(nativeSeek(fixture.page,10000,30000,()=>fixture.time),/original 30000ms/);assert.ok(fixture.time>=30000&&fixture.time<30080);
});
test('b229 correction retains ordinary menu click, original ledger, original limits, and bounded complete audio predicate',async()=>{
 const source=await readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');assert.match(source,/getByRole\('button',\{name:'Open menu',exact:true\}\)\.click/);assert.doesNotMatch(source,/mouse\.down|expectedCancellation|ignore.*abort|route\.fulfill/);assert.match(source,/waitForAudioProof\(\{before:atStart,read:\(\)=>page.evaluate\(\(\)=>globalThis.__r35HomeAudio.snapshot\(\)\)/);assert.match(source,/createUiReceipts\(\{page,origin:target.origin,pins,receipts:row.runtimeBodies\}\)/);
});

test('frozen b229 native-seek loop demonstrably times out at an unreachable document target',async()=>{
 const fixture=geometryPage();
 // The old loop is reproduced exactly in a socket-free synthetic geometry fixture.
 const oldSeek=vm.runInNewContext(`(async function nativeSeek(page,target,limit=budgets.nativeLater) {
  const deadline=performance.now()+limit;await page.mouse.move(8,8);
  while(performance.now()<deadline){const y=await bounded(page.evaluate(()=>scrollY),budgets.command,'Native scroll position');const delta=target-y;if(Math.abs(delta)<2)return;await bounded(page.mouse.wheel(0,Math.sign(delta)*Math.min(1200,Math.abs(delta))),budgets.command,'Native wheel');await page.waitForTimeout(80);}
  throw new Error('Native scroll did not reach target within original '+limit+'ms deadline');
 })`,{performance:{now:()=>fixture.time},budgets:{nativeLater:30000,command:5000},bounded:promise=>promise,Math,Error});
 await assert.rejects(oldSeek(fixture.page,10450,45000),/original 45000ms/);assert.equal(fixture.y,10020);assert.ok(fixture.time>=45000&&fixture.time<45080);
});

test('CSP-safe audio transport sends only a snapshot function, never assessed source text',async()=>{
 const source=await readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/audioProofWaitExpression|assessAudio\.toString|JSON\.stringify\(before\)|bypassCSP|unsafe-eval/);
 assert.doesNotMatch(waitForAudioProof.toString(),/\beval\s*\(|new Function|waitForFunction/);
 const sandbox=vm.createContext({__r35HomeAudio:{snapshot:()=>structuredClone(after)}},{codeGeneration:{strings:false,wasm:false}});
 assert.throws(()=>vm.runInContext('globalThis.eval("1+1")',sandbox),/Code generation from strings disallowed/);
 const snapshot=vm.runInContext('(()=>globalThis.__r35HomeAudio.snapshot())()',sandbox);assert.equal(snapshot.contexts[0].currentTime,after.contexts[0].currentTime);
});
test('audio assessment polling expires at the original absolute25s bound',async()=>{
 let time=0,reads=0;await assert.rejects(waitForAudioProof({before,read:async()=>{reads++;time+=17;return structuredClone(after);},pause:async ms=>{time+=ms;},now:()=>time}),/Original 25000ms/);assert.equal(time,25000);assert.ok(reads>1);
});
test('late successful snapshot cannot pass after the original audio deadline',async()=>{
 let time=0;const value=structuredClone(after);value.contexts[0].currentTime+=.01;await assert.rejects(waitForAudioProof({before,read:async()=>{time=25000;return value;},pause:async()=>{},now:()=>time}),/deadline exceeded after snapshot/);
});

test('route failure retains actual last observation inside the original5s window',async()=>{
 let time=0;const receipt={},last={pathname:'/',menuOpen:false,homeConnected:true,canvasConnected:true,nativeOwners:[{id:1,sceneCanvas:true,connected:true}]};
 await assert.rejects(waitForRouteExit({receipt,read:async()=>structuredClone(last),pause:async ms=>{time+=ms;},now:()=>time}),/Original 5000ms route/);assert.equal(time,5000);assert.equal(receipt.status,'failed');assert.equal(receipt.elapsedMs,5000);assert.deepEqual(receipt.last,last);assert.equal(receipt.samples,50);
});
test('route observation is read-only and returns exact new-route ownership without retry',async()=>{
 let time=0,reads=0;const receipt={};const result=await waitForRouteExit({receipt,read:async()=>({pathname:++reads===1?'/':'/models',menuOpen:false,homeConnected:reads===1,canvasConnected:reads===1,nativeOwners:[]}),pause:async ms=>{time+=ms;},now:()=>time});assert.equal(receipt.status,'passed');assert.equal(time,100);assert.equal(result.pathname,'/models');assert.equal(result.homeConnected,false);
 assert.doesNotMatch(observeRouteExit.toString(),/\.click\(|dispatchEvent|location\s*=|\.stop\(|\beval\s*\(/);assert.match(observeRouteExit.toString(),/nativeOwners/);
});

test('native click failure keeps in-window clipping/hit-test diagnostics without retry',async()=>{
 let time=0,calls=0,rejectAction;const receipt={},snapshot={pathname:'/',menuOpen:true,menu:{clipPath:'inset(0px)'},link:{clipPath:'inset(100% 0px 0px)',animations:[{playState:'running',currentTime:0}]},linkCenterHit:{tag:'DIALOG',belongsToLink:false}};
 await assert.rejects(observeRouteAction({receipt,action:timeout=>{calls++;assert.equal(timeout,5000);return new Promise((_resolve,reject)=>{rejectAction=reject;});},read:async()=>structuredClone(snapshot),pause:async ms=>{time+=ms;if(time===5000)rejectAction(new Error('original native click timeout'));},now:()=>time}),/original native click timeout/);
 assert.equal(calls,1);assert.equal(time,5000);assert.equal(receipt.status,'failed');assert.ok(receipt.lastAt<5000);assert.deepEqual(receipt.last,snapshot);assert.equal(receipt.budget,5000);
 const observer=observeRouteExit.toString();for(const field of ['clipPath','opacity','transform','getAnimations','elementFromPoint','nativeOwners'])assert.ok(observer.includes(field));
});
test('an immediately returned native click adds no diagnostic wait or second action',async()=>{
 let time=0,calls=0;const receipt={};await observeRouteAction({receipt,action:async()=>{calls++;},read:async()=>({pathname:'/models'}),pause:async ms=>{time+=ms;},now:()=>time});assert.equal(calls,1);assert.equal(time,0);assert.equal(receipt.status,'returned');
});

test('late route snapshot fails without replacing prior in-window diagnostics',async()=>{
 let time=0,reads=0;const receipt={},prior={pathname:'/',menuOpen:true,homeConnected:true};await assert.rejects(waitForRouteExit({receipt,read:async()=>{if(++reads===1)return prior;time=5001;return {pathname:'/models',menuOpen:false,homeConnected:false};},pause:async ms=>{time+=ms;},now:()=>time}),/deadline exceeded after snapshot/);assert.deepEqual(receipt.last,prior);assert.equal(receipt.lastAt,0);assert.equal(receipt.samples,1);assert.equal(receipt.status,'failed');
});
