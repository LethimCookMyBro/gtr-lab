import assert from 'node:assert/strict';
export const profileSource = Object.freeze({sha:'70b7644944f908a0dfad8999b0a44a61d84d5d4d',tree:'cd008a4eb221e3323b988a9119e4f7f5109ad90dbf122b08b32127dfea4232a2'});
export const profileLimits = Object.freeze({windowMs:110_000,captureMs:45_000,inputMs:15_000,requestMs:2_000,controlMs:5_000,exportMs:15_000,cpuIntervalMs:1_000,maxCpuSamples:120,maxProcesses:32,traceBufferKb:8192,maxTraceBytes:32*1024*1024,chunkBytes:256*1024});
export const traceCategories = Object.freeze(['toplevel','cc','viz','gpu','devtools.timeline','disabled-by-default-devtools.timeline.frame','latencyInfo']);
export function validatePipelineEnvironment(env) {
 assert.equal(env.GITHUB_ACTIONS,'true','Pipeline profile is CI-only');assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 assert.ok((env.R35_PIPELINE_COMMIT_MESSAGE??'').includes('[stage-pipeline-profile]'),'Explicit pipeline-profile marker required');assert.equal(env.R35_ALLOW_PIPELINE_PROFILE,'1','Explicit pipeline opt-in required');
 assert.equal(env.R35_PIPELINE_SOURCE_SHA,profileSource.sha);assert.equal(env.R35_PIPELINE_SOURCE_TREE,profileSource.tree);assert.equal(env.R35_PIPELINE_KIND,'orbit-first-capture');assert.equal(env.R35_PIPELINE_BASE_URL,undefined,'Arbitrary/public target forbidden');
 for(const key of ['PLAYWRIGHT_LEGACY_SCREENSHOT','DEBUG','DEBUG_FILE'])assert.equal(env[key],undefined,`Ambient ${key} forbidden`);
 return {name:'desktop',scale:'css',viewport:{width:1440,height:900},deviceScaleFactor:2,baseUrl:'http://127.0.0.1:4178'};
}
export function resolvePipelineRequest(request,env) {
 assert.deepEqual(Object.keys(request).sort(),['allow','profile','sourceSha','sourceTree','version']);assert.equal(request.version,1);assert.equal(request.allow,true);
 const values={R35_ALLOW_PIPELINE_PROFILE:'1',R35_PIPELINE_SOURCE_SHA:request.sourceSha,R35_PIPELINE_SOURCE_TREE:request.sourceTree,R35_PIPELINE_KIND:request.profile};validatePipelineEnvironment({...env,...values});return values;
}
export function normalizeProcessInfo(value,maxProcesses=profileLimits.maxProcesses) {
 assert(Array.isArray(value)&&value.length>0&&value.length<=maxProcesses,'Bounded nonempty browser-process CPU list required');const ids=new Set();
 return value.map(p=>{assert(Number.isSafeInteger(p.id)&&p.id>0&&!ids.has(p.id),'Distinct positive browser process IDs required');ids.add(p.id);assert(typeof p.type==='string'&&p.type.length>0&&p.type.length<=64);assert(Number.isFinite(p.cpuTime)&&p.cpuTime>=0);return {id:p.id,type:p.type,cpuTime:p.cpuTime};});
}
export function summarizeProcessCpu(samples) {
 const intervals=[],issues=[];
 for(let i=1;i<samples.length;i++) {
  const a=samples[i-1],b=samples[i],elapsedSeconds=(b.time-a.time)/1000;assert(elapsedSeconds>0,'Increasing CPU sample clock required');const previous=new Map(a.processes.map(p=>[p.id,p]));
  for(const p of b.processes) {const old=previous.get(p.id);if(!old||old.type!==p.type){issues.push(`Process ${p.id} appeared/changed; no invented baseline`);continue;}const cpuSeconds=p.cpuTime-old.cpuTime;if(cpuSeconds<0){issues.push(`Process ${p.id} CPU counter decreased`);continue;}intervals.push({id:p.id,type:p.type,from:a.time,to:b.time,fromPhase:a.phase,toPhase:b.phase,mixedPhase:a.phase!==b.phase||a.phaseBefore!==a.phase||b.phaseBefore!==b.phase,cpuSeconds,elapsedSeconds,cpuSecondsPerWallSecond:cpuSeconds/elapsedSeconds});}
  for(const p of a.processes)if(!b.processes.some(q=>q.id===p.id))issues.push(`Process ${p.id} disappeared`);
 }
 return {intervals,issues:[...new Set(issues)],interpretation:'CPU seconds across all process threads; a ratio above 1 is valid. Request send/receive brackets are retained; intervals crossing phases are explicitly mixed. Chromium may report zero when a process CPU counter is unavailable. This is not GPU completion, device FPS or a causal verdict.'};
}
export function traceStartOptions(available) {
 assert(Array.isArray(available));for(const c of traceCategories)assert(available.includes(c),`Required trace category absent: ${c}`);
 return {transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'none',bufferUsageReportingInterval:1000,traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:profileLimits.traceBufferKb,enableSampling:false,enableSystrace:false,enableArgumentFilter:true,includedCategories:[...traceCategories],excludedCategories:['disabled-by-default-devtools.screenshot','disabled-by-default-devtools.timeline.screenshot','disabled-by-default-v8.cpu_profiler','disabled-by-default-v8.cpu_profiler.hires','disabled-by-default-gpu.service','disabled-by-default-netlog']}};
}
export function summarizeTimeline(bytes) {
 const data=JSON.parse(bytes.toString('utf8'));const events=data.traceEvents;assert(Array.isArray(events),'Trace event array required');const processNames=new Map(),threadNames=new Map(),names=new Map(),clockSyncMarkers=[];let unsafe=false;
 for(const e of events) {if(e.name==='clock_sync'&&['pipeline-orbit-input','pipeline-single-capture'].includes(e.args?.sync_id)&&Number.isFinite(e.ts)&&clockSyncMarkers.length<16)clockSyncMarkers.push({syncId:e.args.sync_id,traceTimestampUs:e.ts});if(/screenshot|netlog|cpu_profiler/i.test(String(e.cat??''))||e.name==='Screenshot')unsafe=true;if(e.ph==='M'&&e.name==='process_name')processNames.set(e.pid,String(e.args?.name??''));if(e.ph==='M'&&e.name==='thread_name')threadNames.set(`${e.pid}:${e.tid}`,String(e.args?.name??''));if(e.ph==='X'&&Number.isFinite(e.dur)&&e.dur>=0){const key=`${e.pid}:${e.tid}:${String(e.name).slice(0,180)}`;const item=names.get(key)??{pid:e.pid,tid:e.tid,name:String(e.name).slice(0,180),count:0,totalUs:0,maxUs:0};item.count++;item.totalUs+=e.dur;item.maxUs=Math.max(item.maxUs,e.dur);names.set(key,item);}}
 assert(!unsafe,'Trace contains forbidden screenshot/network/profiler categories; do not retain raw trace');
 const processTracks=[...processNames].map(([pid,name])=>({pid,name}));
 const hasRendererTrack=processTracks.some(p=>/renderer/i.test(p.name))||[...threadNames.values()].some(n=>n==='CrRendererMain');const hasGpuTrack=processTracks.some(p=>/gpu/i.test(p.name))||[...threadNames.values()].some(n=>/GpuMain/i.test(n));
 return {eventCount:events.length,clockSyncMarkers,processTracks,threadTracks:[...threadNames].map(([id,name])=>({id,name})),hasRendererTrack,hasGpuTrack,topSlices:[...names.values()].sort((a,b)=>b.totalUs-a.totalUs).slice(0,80),limitation:'Slice durations may overlap/nest; totals are not additive CPU usage. Missing process tracks or incomplete export makes attribution inconclusive.'};
}
