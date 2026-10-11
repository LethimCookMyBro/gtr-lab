import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { profileSource, profileLimits, traceCategories, validatePipelineEnvironment, resolvePipelineRequest, normalizeProcessInfo, summarizeProcessCpu, traceStartOptions, summarizeTimeline } from '../scripts/pipeline-profile-policy.mjs';
import { bounded, createPipelineCollector, createSingleProfiledCapture } from '../scripts/pipeline-profile-collector.mjs';
import { main } from '../scripts/diagnose-pipeline-profile.mjs';
const env = () => ({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),R35_PIPELINE_COMMIT_MESSAGE:'QA [stage-pipeline-profile]',R35_ALLOW_PIPELINE_PROFILE:'1',R35_PIPELINE_SOURCE_SHA:profileSource.sha,R35_PIPELINE_SOURCE_TREE:profileSource.tree,R35_PIPELINE_KIND:'orbit-first-capture'});
const trace = () => ({traceEvents:[{ph:'M',pid:1,tid:1,name:'process_name',args:{name:'Renderer'}},{ph:'M',pid:2,tid:2,name:'thread_name',args:{name:'CrGpuMain'}},{ph:'X',pid:2,tid:2,name:'CaptureScreenshot',cat:'gpu',dur:500,ts:1000},{ph:'X',pid:2,tid:2,name:'Draw',cat:'gpu',dur:200,ts:1100}]});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const fast = {...profileLimits,cpuIntervalMs:3,requestMs:30,controlMs:50,exportMs:100,windowMs:1000};
class FakeCdp extends EventEmitter {
  calls=[];cpu=0;overrides={};payload=trace();dataLoss=false;
  async send(method,params) {
    this.calls.push({method,params});
    if(this.overrides[method])return this.overrides[method](params,this);
    if(method==='Tracing.getCategories')return {categories:[...traceCategories]};
    if(method==='SystemInfo.getProcessInfo')return {processInfo:[{id:1,type:'renderer',cpuTime:++this.cpu/100},{id:2,type:'GPU',cpuTime:this.cpu/50}]};
    if(method==='Tracing.recordClockSyncMarker'){this.payload.traceEvents.push({ph:'c',cat:'__metadata',name:'clock_sync',args:{sync_id:params.syncId},ts:performance.now()*1000});return {};}
    if(method==='Tracing.end'){queueMicrotask(()=>this.emit('Tracing.tracingComplete',{stream:'trace-stream',dataLossOccurred:this.dataLoss}));return {};}
    if(method==='IO.read')return {data:JSON.stringify(this.payload),eof:true};
    return {};
  }
}
function fixture(options={}) { const cdp=new FakeCdp(),writes=[];const collector=createPipelineCollector({cdp,writeTrace:async b=>writes.push(b),limits:fast,...options});return {cdp,writes,collector}; }
async function twoSamples(c) {const deadline=Date.now()+1000;while(c.snapshot().samples.length<2){assert(Date.now()<deadline,'CPU samples timed out');await pause(3);}}
test('exact source/environment guard rejects every bypass before dynamic imports',async()=>{
  const valid=env();assert.deepEqual(validatePipelineEnvironment(valid).viewport,{width:1440,height:900});
  for(const [key,value] of Object.entries({GITHUB_ACTIONS:'false',GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/dev',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'current',R35_PIPELINE_COMMIT_MESSAGE:'unmarked',R35_ALLOW_PIPELINE_PROFILE:'0',R35_PIPELINE_SOURCE_SHA:'current',R35_PIPELINE_SOURCE_TREE:'0'.repeat(64),R35_PIPELINE_KIND:'idle',R35_PIPELINE_BASE_URL:'https://public.example',DEBUG:'',DEBUG_FILE:'',PLAYWRIGHT_LEGACY_SCREENSHOT:''}))assert.throws(()=>validatePipelineEnvironment({...valid,[key]:value}),key);
  await assert.rejects(main({}),/CI-only/); // No helper/browser import or socket can precede this rejection.
});
test('request shape and exact literal source are fail-closed',()=>{
 const request={version:1,allow:true,profile:'orbit-first-capture',sourceSha:profileSource.sha,sourceTree:profileSource.tree};assert.equal(resolvePipelineRequest(request,env()).R35_PIPELINE_SOURCE_SHA,profileSource.sha);
 for(const r of [{...request,allow:false},{...request,sourceSha:'current'},{...request,extra:true},{...request,version:2}])assert.throws(()=>resolvePipelineRequest(r,env()));
});
test('CPU metadata strips unrelated fields and rejects unbounded/malformed process lists',()=>{
 assert.deepEqual(normalizeProcessInfo([{id:1,type:'GPU',cpuTime:2,args:'secret'}]),[{id:1,type:'GPU',cpuTime:2}]);
 for(const input of [[],[{id:0,type:'GPU',cpuTime:1}],[{id:1,type:'GPU',cpuTime:-1}],[{id:1,type:'GPU',cpuTime:1},{id:1,type:'GPU',cpuTime:2}],Array.from({length:33},(_,i)=>({id:i+1,type:'GPU',cpuTime:1}))])assert.throws(()=>normalizeProcessInfo(input));
});
test('CPU ratios may exceed one; mixed phases and lost/reset counters are explicit',()=>{
 const sample=(time,phase,cpuTime,id=1)=>({time,hostBefore:time-1,phaseBefore:phase,phase,processes:[{id,type:'GPU',cpuTime}]});
 const s=summarizeProcessCpu([sample(1000,'orbit',1),sample(2000,'capture',3)]);assert.equal(s.intervals[0].cpuSecondsPerWallSecond,2);assert.equal(s.intervals[0].mixedPhase,true);assert.equal(s.intervals[0].fromPhase,'orbit');assert.equal(s.intervals[0].toPhase,'capture');
 assert.match(summarizeProcessCpu([sample(1,'orbit',3),sample(2,'orbit',2)]).issues[0],/decreased/);assert.equal(summarizeProcessCpu([sample(1,'orbit',1),sample(2,'orbit',2,2)]).issues.length,2);assert.throws(()=>summarizeProcessCpu([sample(1,'orbit',1),sample(1,'orbit',2)]));
});
test('trace configuration is capped, argument-filtered, and excludes sensitive/high-cost categories',()=>{
 const o=traceStartOptions(traceCategories);assert.equal(o.traceConfig.traceBufferSizeInKb,8192);assert.equal(o.traceConfig.recordMode,'recordUntilFull');assert.equal(o.traceConfig.enableArgumentFilter,true);assert.equal(o.traceConfig.enableSampling,false);assert.equal(o.traceConfig.enableSystrace,false);assert.equal(o.transferMode,'ReturnAsStream');assert.equal(o.streamCompression,'none');assert.deepEqual(o.traceConfig.includedCategories,traceCategories);assert.throws(()=>traceStartOptions(['gpu']));
 assert(!o.traceConfig.includedCategories.some(c=>/screenshot|cpu_profiler|netlog/.test(c)));
});
test('timeline exposes bounded metadata, keeps legitimate copy slices, rejects screenshot payload categories',()=>{
 const s=summarizeTimeline(Buffer.from(JSON.stringify(trace())));assert(s.hasRendererTrack&&s.hasGpuTrack);assert.equal(s.topSlices[0].name,'CaptureScreenshot');assert(!JSON.stringify(s).includes('traceEvents'));
 for(const e of [{ph:'I',name:'Screenshot',cat:'devtools.timeline'},{ph:'X',name:'hidden',cat:'disabled-by-default-devtools.screenshot'},{ph:'X',name:'network',cat:'netlog'}]){const payload=trace();payload.traceEvents.push(e);assert.throws(()=>summarizeTimeline(Buffer.from(JSON.stringify(payload))),/forbidden/);}
});
test('success closes stream, removes listeners, stops sampling, and exports once',async()=>{
 const {cdp,collector,writes}=fixture();await collector.start();await collector.mark('orbit-input');await twoSamples(collector);await collector.mark('single-capture');const r=await collector.stop();assert.equal(r.status,'collected');assert.equal(r.trace.streamClosed,true);assert.equal(writes.length,1);assert.equal(r.markers.length,2);assert(r.markers.every(m=>m.acknowledged&&m.hostAfter>=m.hostBefore&&Number.isFinite(m.traceTimestampUs)));assert.equal(cdp.listenerCount('Tracing.tracingComplete'),0);const n=cdp.calls.length;await pause(12);assert.equal(cdp.calls.length,n);await collector.stop();assert.equal(writes.length,1);assert.equal(cdp.calls.filter(c=>c.method==='Tracing.end').length,1);
});
test('only one screenshot, stop requested immediately on success without waiting for export',async()=>{
 let stopped=false,resolveStop;const stopPromise=new Promise(resolve=>resolveStop=resolve);const single=createSingleProfiledCapture({active:()=>true,stop:()=>{stopped=true;return stopPromise;}});const bytes=Buffer.from('png');assert.equal(await single.run(async()=>bytes),bytes);assert(stopped);await assert.rejects(single.run(async()=>{throw new Error('must not run');}),/Only one/);resolveStop({status:'collected'});assert.equal((await single.finish()).status,'collected');
});
test('screenshot timeout/browser error is preserved, stop is requested, and no retry is possible',async()=>{
 for(const text of ['Timeout 45000ms exceeded','Target page, context or browser has been closed']){let calls=0,stops=0;const single=createSingleProfiledCapture({active:()=>true,stop:async()=>{stops++;return {status:'inconclusive'};}}),error=new Error(text);await assert.rejects(single.run(async()=>{calls++;throw error;}),e=>e===error);assert.equal(stops,1);await single.finish();await assert.rejects(single.run(async()=>calls++),/Only one/);assert.equal(calls,1);}
});
test('profile stopping during pre-capture geometry cannot enqueue screenshot',async()=>{
 let active=true,calls=0;const single=createSingleProfiledCapture({active:()=>active,stop:async()=>({status:'inconclusive'})});active=false;await assert.rejects(single.run(async()=>calls++),/stopped before screenshot/);assert.equal(calls,0);await single.finish();
});
test('browser failure still attempts trace end, removes listeners, and returns inconclusive',async()=>{
 const {cdp,collector}=fixture();await collector.start();await twoSamples(collector);cdp.overrides['Tracing.end']=async()=>{throw new Error('Browser closed');};const r=await collector.stop('browser-failure');assert.equal(r.status,'inconclusive');assert.equal(r.trace.status,'incomplete');assert(r.issues.some(s=>s.includes('Browser closed')));assert.equal(cdp.listenerCount('Tracing.bufferUsage'),0);assert.equal(cdp.calls.filter(c=>c.method==='Tracing.end').length,1);
});
test('stop does not wait for a stuck process CPU request before asking Chromium to end tracing',async()=>{
 const {cdp,collector}=fixture();await collector.start();cdp.overrides['SystemInfo.getProcessInfo']=()=>new Promise(()=>{});await pause(5);const pending=collector.stop('test-stop');await pause(2);assert(cdp.calls.some(c=>c.method==='Tracing.end'));const r=await pending;assert.equal(r.status,'inconclusive');assert(r.issues.some(s=>s.includes('SystemInfo.getProcessInfo exceeded')));
});
test('wall timer starts before trace-start acknowledgement and cleanup runs even on start timeout',async()=>{
 const {cdp,collector}=fixture({limits:{...fast,windowMs:8,controlMs:30}});cdp.overrides['Tracing.start']=()=>new Promise(()=>{});const pending=collector.start();await pause(15);assert(cdp.calls.some(c=>c.method==='Tracing.end'));await assert.rejects(pending,/Tracing.start exceeded/);const r=await collector.stop();assert.equal(r.stopReason,'window-limit');assert.equal(r.status,'inconclusive');assert.equal(cdp.listenerCount('Tracing.tracingComplete'),0);
});
test('initial CPU failure ends trace and closes the returned stream',async()=>{
 const {cdp,collector}=fixture();cdp.overrides['SystemInfo.getProcessInfo']=async()=>{throw new Error('CPU unavailable');};await assert.rejects(collector.start(),/Initial CPU/);assert.equal(collector.snapshot().trace.streamClosed,true);assert.equal(collector.snapshot().status,'inconclusive');
});
test('trace export failure, byte overflow, and forbidden payload always close stream without publishing raw bytes',async()=>{
 for(const kind of ['read','overflow','unsafe']){const {cdp,collector,writes}=fixture({limits:{...fast,maxTraceBytes:kind==='overflow'?2:fast.maxTraceBytes}});if(kind==='read')cdp.overrides['IO.read']=async()=>{throw new Error('read failed');};if(kind==='unsafe')cdp.payload.traceEvents.push({ph:'I',cat:'gpu',name:'Screenshot',args:{snapshot:'forbidden'}});await collector.start();await twoSamples(collector);const r=await collector.stop();assert.equal(r.status,'inconclusive',kind);assert.equal(r.trace.streamClosed,true,kind);assert.equal(writes.length,0,kind);}
});
test('trace data loss, full buffer, missing tracks and failed stream closure remain inconclusive',async()=>{
 for(const kind of ['loss','full','tracks','close']){const {cdp,collector}=fixture();if(kind==='loss')cdp.dataLoss=true;if(kind==='tracks')cdp.payload={traceEvents:[]};if(kind==='close')cdp.overrides['IO.close']=async()=>{throw new Error('close failed');};await collector.start();await twoSamples(collector);if(kind==='full')cdp.emit('Tracing.bufferUsage',{percentFull:1});const r=await collector.stop();assert.equal(r.status,'inconclusive',kind);}
});
test('trace-write failure still closes stream and bounded helper retains original errors',async()=>{
 const {collector}=fixture({writeTrace:async()=>{throw new Error('disk full');}});await collector.start();await twoSamples(collector);const r=await collector.stop();assert.equal(r.trace.streamClosed,true);assert(r.issues.some(s=>s.includes('disk full')));const error=new Error('original');await assert.rejects(bounded(Promise.reject(error),10,'x'),e=>e===error);await assert.rejects(bounded(new Promise(()=>{}),3,'x'),/exceeded/);
});
test('driver contract preserves default flags, immutable models/pixels, one45s attempt, no initial capture or protocol serialization',async()=>{
 const source=await readFile(new URL('../scripts/diagnose-pipeline-profile.mjs',import.meta.url),'utf8');assert(source.indexOf('validatePipelineEnvironment(env)')<source.indexOf("await import("));assert.match(source,/launchFeatureBrowser\(chromium, 'default'\)/);assert.match(source,/captureModels/);assert.doesNotMatch(source,/cabin-integration-policy|captureWithTimeoutRetry|PLAYWRIGHT_LEGACY_SCREENSHOT\s*=/);assert.match(source,/enabled: false, debug/);assert.equal((source.match(/page\.screenshot\(/g)||[]).length,1);assert.match(source,/timeout:45_000,scale:'css'/);assert.match(source,/await capture\('02-orbit'\)/);assert.doesNotMatch(source,/capture\('01-/);assert.match(source,/Exact reviewed capture-boundary native geometry required/);assert.match(source,/f\.complete !== false/);assert.match(source,/sceneIds\.has\(f\.contextId\)/);assert.match(source,/originalAcceptanceChanged: false/);assert.match(source,/\['browser close',\(\)=>browser\?\.close\(\)\]/);
});
test('known stream is closed even when tracingComplete precedes a rejected end acknowledgement',async()=>{
 const {cdp,collector,writes}=fixture();await collector.start();await twoSamples(collector);cdp.overrides['Tracing.end']=async()=>{cdp.emit('Tracing.tracingComplete',{stream:'late-stream'});throw new Error('End acknowledgement failed');};const r=await collector.stop();assert.equal(r.status,'inconclusive');assert.equal(r.trace.streamClosed,true);assert.deepEqual(cdp.calls.filter(c=>c.method==='IO.close').map(c=>c.params.handle),['late-stream']);assert.equal(writes.length,0);
});
test('single-job push workflow resolves opt-in before setup and never changes earlier requests',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/pipeline-profile-diagnostic.yml',import.meta.url),'utf8');const request=JSON.parse(await readFile(new URL('../qa/pipeline-profile-request.json',import.meta.url),'utf8'));resolvePipelineRequest(request,env());assert.match(workflow,/\[stage-pipeline-profile\]/);assert.match(workflow,/github.repository == 'LethimCookMyBro\/gtr-lab'/);assert.match(workflow,/github.ref == 'refs\/heads\/main'/);assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);assert.match(workflow,/ref: \$\{\{ env.R35_PIPELINE_SOURCE_SHA \}\}/);assert(workflow.indexOf('resolvePipelineRequest(request,process.env)')<workflow.indexOf('path: candidate'));assert(workflow.indexOf('resolvePipelineRequest(request,process.env)')<workflow.indexOf('npm ci'));assert.doesNotMatch(workflow,/matrix:|workflow_dispatch:|deploy|Library|screenshot-feature-request|capture-path-request/);assert.match(workflow,/timeout-minutes: 7/);assert.match(workflow,/retention-days: 14/);
});
test('missing/filtered clock anchor cannot claim phase alignment from command acknowledgement',async()=>{
 const {cdp,collector}=fixture();cdp.overrides['Tracing.recordClockSyncMarker']=async()=>({});await collector.start();await collector.mark('orbit-input');await twoSamples(collector);const r=await collector.stop();assert.equal(r.status,'inconclusive');assert(r.issues.some(s=>s.includes('Trace clock anchor missing')));assert.equal(r.markers[0].traceTimestampUs,undefined);
});
test('parse and artifact writing share the export deadline, while stream close still runs',async()=>{
 let time=0;const {collector}=fixture({now:()=>++time,limits:{...fast,exportMs:3}});await collector.start();await twoSamples(collector);const r=await collector.stop();assert.equal(r.status,'inconclusive');assert(r.issues.some(s=>s.includes('export wall-time cap')));assert.equal(r.trace.streamClosed,true);
});
