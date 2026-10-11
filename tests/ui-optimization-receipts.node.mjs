import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createUiReceipts } from '../scripts/ui-optimization-receipts.mjs';
import { sha256 } from '../scripts/ui-optimization-policy.mjs';
const bytes=Buffer.from('exact original module bytes'),origin='http://127.0.0.1:4189',path='/assets/VehicleScene-Be3uSbJz.js';
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup() {
  const page=new EventEmitter(),navigations=[],receipts=[],timers=new Map();let time=0,id=0;
  page.goto=async url=>navigations.push(url);
  const collector=createUiReceipts({page,origin,pins:new Map([[path,{bytes:bytes.length,sha256:sha256(bytes)}]]),receipts,now:()=>time,setTimer:(callback,delay)=>{const key=++id;timers.set(key,{callback,at:time+delay});return key;},clearTimer:key=>timers.delete(key)});
  const request=()=>({url:()=>origin+path,failure:()=>({errorText:'original aborted request'})});
  const respond=(request,body)=>page.emit('response',{request:()=>request,url:()=>origin+path,status:()=>200,body});
  const advance=amount=>{time+=amount;for(const [key,timer] of [...timers])if(timer.at<=time){timers.delete(key);timer.callback();}};
  return {page,navigations,receipts,collector,request,respond,advance};
}
test('hard navigation waits for issued-without-response and exact same-document body',async()=>{
  const s=setup();await s.collector.navigate(origin+'/');const request=s.request(),body=deferred();s.page.emit('request',request);
  assert.equal(s.receipts[0].state,'issued');let navigated=false;
  const next=s.collector.navigate(origin+'/configurator/premium').then(()=>{navigated=true;});await flush();assert.equal(navigated,false);assert.equal(s.navigations.length,1);
  s.respond(request,()=>body.promise);await flush();assert.equal(navigated,false);body.resolve(bytes);await next;
  assert.equal(s.receipts[0].state,'body-completed');assert.equal(s.receipts[0].generation,1);assert.equal(s.navigations.length,2);assert.equal(s.collector.snapshot().generations[0].state,'sealed');
  await s.collector.finish();s.collector.stop();assert.equal(s.page.listenerCount('request'),0);
});
test('original body failure stays failed; later same-URL success cannot substitute or trigger navigation',async()=>{
  const s=setup();await s.collector.navigate(origin+'/');const original=s.request(),later=s.request();s.page.emit('request',original);s.page.emit('request',later);
  const failure='response.body: No resource with given identifier found; navigated away';s.respond(original,()=>Promise.reject(new Error(failure)));s.respond(later,()=>bytes);await flush();
  await assert.rejects(s.collector.navigate(origin+'/configurator/premium'),/ledger failed/);assert.equal(s.navigations.length,1);
  assert.equal(s.receipts[0].sha256,undefined);assert.equal(s.receipts[0].state,'error');assert.match(s.receipts[0].error,/navigated away/);assert.equal(s.receipts[1].sha256,sha256(bytes));s.collector.stop();
});
test('original 15s navigation drain deadline expires without issuing the next document',async()=>{
  const s=setup();await s.collector.navigate(origin+'/');const request=s.request(),body=deferred();s.page.emit('request',request);s.respond(request,()=>body.promise);
  const next=assert.rejects(s.collector.navigate(origin+'/configurator/premium'),/deadline exceeded/);
  s.advance(14999);await flush();assert.equal(s.navigations.length,1);s.advance(1);await next;assert.equal(s.navigations.length,1);assert.equal(s.receipts[0].state,'error');
  body.resolve(bytes);await flush();assert.equal(s.navigations.length,1,'Late original body completion cannot resume a rejected navigation');assert.equal(s.receipts[0].state,'error');assert.equal(s.receipts[0].sha256,undefined);assert.equal(s.collector.snapshot().state,'failed');assert.equal(s.collector.snapshot().lateEvents.length,1);s.collector.stop();
});
test('drawer failure diagnostics preserve original 5s predicate and record the real animation',async()=>{
  const source=await readFile(new URL('../scripts/ui-optimization-browser.mjs',import.meta.url),'utf8');
  for(const evidence of ['originalDeadlineMs:5000','animation.constructor.name','animation.animationName','animation.currentTime','animation.effect?.getTiming()','animation.effect?.getComputedTiming()','animation.timeline?.currentTime','originalError=String(error)','afterFailureCapture=await inspect()'])assert.ok(source.includes(evidence),evidence);
  assert.ok(source.includes("},{timeout:5000}).toBe(0)"));assert.ok(source.includes('await save();throw error;'));
  assert.doesNotMatch(source,/\.finish\(\).*animation|animation\.cancel|animation\.currentTime\s*=|page\.goto\(/);
});
