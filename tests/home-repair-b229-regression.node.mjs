import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {nativeSeek,sectionTarget,audioProofWaitExpression} from '../scripts/home-repair-browser.mjs';
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
test('b229 samples-only predicate passes before the required native context clock advances',()=>{
 const oldReady=after.edges.some(edge=>edge.active&&edge.fromKind==='source'&&after.samples.some(sample=>sample.gainNodeId===edge.to&&sample.peak>1e-7&&sample.connectedToDestination));assert.equal(oldReady,true);assert.equal(assessAudio(before,after).passed,false);assert.equal(assessAudio(before,after).clockAdvanced,false);
 const sandbox={__r35HomeAudio:{snapshot:()=>structuredClone(after)}};vm.createContext(sandbox);const expression=audioProofWaitExpression(before);assert.equal(vm.runInContext(expression,sandbox),false);
 after.contexts[0].currentTime+=.01;assert.equal(vm.runInContext(expression,sandbox),true);after.contexts[0].currentTime-=.01;
});
test('full playback predicate still rejects untrusted resume, wrong source/gain and silent output',()=>{
 for(const mutate of [state=>state.events[0].trustedGesture=false,state=>state.samples.forEach(sample=>sample.peak=0),state=>state.samples.forEach(sample=>sample.gainNodeId=999),state=>state.edges[1].active=false]){const state=structuredClone(after);state.contexts[0].currentTime+=.01;mutate(state);const sandbox={__r35HomeAudio:{snapshot:()=>state}};vm.createContext(sandbox);assert.equal(vm.runInContext(audioProofWaitExpression(before),sandbox),false);}
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
 const source=await readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');assert.match(source,/getByRole\('button',\{name:'Open menu',exact:true\}\)\.click/);assert.doesNotMatch(source,/mouse\.down|expectedCancellation|ignore.*abort|route\.fulfill/);assert.match(source,/waitForFunction\(audioProofWaitExpression\(atStart\),null,\{timeout:budgets.initialPage,polling:100\}\)/);assert.match(source,/createUiReceipts\(\{page,origin:target.origin,pins,receipts:row.runtimeBodies\}\)/);
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
