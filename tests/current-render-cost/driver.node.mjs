import test from 'node:test';import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {runBoundedPrefix,summarizeInterval,main} from '../../scripts/current-render-cost-runner.mjs';
import {actionPrefix} from '../../scripts/current-render-cost-policy.mjs';
test('first failed operation stops execution, persists pending native evidence, and blocks every suffix row',async()=>{
 const calls=[],saves=[];const raw={lastMain:{id:3,stable:true},latestFence:{id:3,previous:null,status:0x911b}};
 const result=await runBoundedPrefix(actionPrefix('studio-standard'),async step=>{calls.push(step.id);if(step.id==='top')throw Error('timeout');return {certificate:'present'};},async()=>raw,async rows=>saves.push(structuredClone(rows)));
 assert.ok(result,'Missing bounded execution');assert.equal(result.find(x=>x.id==='top').status,'failed');assert.equal(calls.at(-1),'top');assert.equal(result.find(x=>x.id==='low').status,'blocked');assert.deepEqual(result.find(x=>x.id==='top').failure.raw,raw);assert.ok(saves.length>calls.length);
});
test('interval separates submission CPU counts from raw native completion and retains right censoring',()=>{
 const raw={events:[{kind:'mark',phase:'arm',sequence:1,at:0},{kind:'input',trusted:true,sequence:2,at:10},{kind:'main',sequence:4,at:9000,owner:1,id:1,stable:true},{kind:'fence',sequence:5,at:9010,owner:1,id:7,draws:[1],previous:null},{kind:'wait',sequence:6,at:14000,owner:1,id:7,status:0x911b}],passes:[{sequence:3,owner:1,firstCallStartedAt:7000,lastCallEndedAt:8900,drawNativeCallMs:200,draws:30,triangles:500,framebuffer:null,viewport:[0,0,1920,924]}]};
 const result=summarizeInterval(raw,0,15000);assert.ok(result,'Missing interval analysis');assert.equal(result.firstSubmissionAt,7000);assert.equal(result.exactAdmissionAt,null);assert.equal(result.unpartitionedInputToFirstSubmissionMs,6990);assert.equal(result.mainObservedAt,9000);assert.equal(result.completionObservedAt,null);assert.equal(result.censored,true);assert.equal(result.fences[0].previous,null);assert.equal(result.workload.draws,30);
 raw.events.push({kind:'wait',sequence:7,at:15001,owner:1,id:7,status:0x911c});const late=summarizeInterval(raw,0,15000);assert.equal(late.completionObservedAt,15001);assert.equal(late.censored,true,'Late completion cannot repair deadline miss');
});
test('frozen runtime entry rejects before Playwright import or server creation',async()=>{await assert.rejects(()=>main({}),/disabled|CI required/);});
test('driver has no production edits, retries, synthetic input, forced quality or added completion fixtures',async()=>{
 const source=await readFile(new URL('../../scripts/current-render-cost-runner.mjs',import.meta.url),'utf8');assert.ok(source.includes('radio.click()'),'Missing actual UI quality selection');
 for(const text of ['dispatchEvent','clientWaitSync(','fenceSync(','requestAnimationFrame(','setInterval(','setTimeout(','releaseCompletion(','armCurrent(','setQuality('])assert.equal(source.includes(text),false,text);
 assert.ok(source.includes('timeout: 45_000'));assert.ok(source.includes('timeout: 90_000'));assert.ok(source.includes('timeout: 15_000'));
});
test('runtime body receipt collection is request-bound and bounded before unconditional teardown',async()=>{
 const source=await readFile(new URL('../../scripts/current-render-cost-runner.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('createRuntimeBodyLedger'),'Missing existing bounded ledger');assert.ok(source.includes("page.on('request',"),'Issued requests must be tracked');assert.ok(source.includes('ledger.finish({window:readinessWindow(15000)})'),'Missing bounded body finalization');assert.equal(source.includes('Promise.all(pendingBodies)'),false,'Unbounded body drain');assert.ok(source.includes('report.bodyLedger=ledger.snapshot()'));
});
test('work before trusted input remains separate and never yields a negative admission bound',()=>{
 const evidence={events:[{kind:'input',trusted:true,sequence:2,at:50}],passes:[{sequence:1,firstCallStartedAt:10,lastCallEndedAt:20,draws:1,triangles:1,drawNativeCallMs:1},{sequence:3,firstCallStartedAt:60,lastCallEndedAt:70,draws:1,triangles:1,drawNativeCallMs:1}]};
 const result=summarizeInterval(evidence,0,100);assert.equal(result.firstSubmissionAt,60);assert.equal(result.unpartitionedInputToFirstSubmissionMs,10);assert.equal(result.preInputPasses.length,1);
});
test('cleanup attempts server close even when evidence persistence and browser close both reject',async()=>{
 const {cleanupResources}=await import('../../scripts/current-render-cost-runner.mjs');assert.equal(typeof cleanupResources,'function','Missing unconditional cleanup');
 const called=[];const result=await cleanupResources({persist:async()=>{called.push('save');throw Error('disk');},browser:{close:async()=>{called.push('browser');throw Error('browser');}},server:{listening:true,closeAllConnections(){called.push('connections');},close(done){called.push('server');done();}}});
 assert.deepEqual(called,['save','browser','connections','server']);assert.equal(result.confirmed,false);assert.equal(result.serverClosed,true);assert.equal(result.errors.length,2);
});
