import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const expectedRequest = Object.freeze({version:1,allow:false,contract:'current-render-cost-four-cell-v1',sourceCommit:'28f586ce35b4441254c10583fc7bc1da3265a106',sourceTree:'7632e86545bdd559e38cac1133245b5b284b5bbb1b97d2fc6100ad66d021011b',cells:['studio-standard','studio-reduced','night-standard','night-reduced'],viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce',budgets:{availabilityMs:90000,functionalMs:15000,captureMs:45000},retries:0});
export const helperPins = Object.freeze({
 'scripts/cabin-runtime-body-ledger.mjs':'356ec061cdea91e834d9a060e1837d06e2cc2d9977bb4232aae3c0d2a239703b',
 'scripts/cabin-preparation-policy.mjs':'f62c8eed6f18e465ce98721961343ef54bb82d0a13f51e20c3e8eb8e0f3b37cb',
 'scripts/capture-environments.mjs':'73b50776dd511f82d7bc6a979f8a8fd9854355ee2b142ac3c74a1bb6eeed014d',
 'scripts/functional-capture-readiness.mjs':'816f8123344a2ab9f98a2469a81758266fc3d60d69545977dae3e19412a2dffb',
 'scripts/vehicle-preview-readiness.mjs':'7005f0acc335ddfd2784a3f3ce6f0f4615447636074bc85e36e30259a0cbd17a',
 'scripts/environment-pixel-comparison.mjs':'5994eaa59262f1093ec008e441e1247aaa62b20dca8842f254a4f34545d4d958',
 'scripts/build-selectable-quality-drivers.mjs':'5e22bfb35be5392853ebbfa071108fec6d2a3385f327c8d083696b96ff0013df',
 'scripts/dpr-motion-policy.mjs':'33a69e394835ac5592c54c4b1dd278c80b42f3fb8335ee2821a075d5d66ba36b',
 'scripts/raster-cost-evidence.mjs':'fe9444220bc251f2f71a3be16af24a08e3a2abc3876113b66e30e94bc3388a2a',
 'src/components/three/demandFrameAdmission.ts':'9daae116023843422f760b8031261ddb26b691ab4aa7f3dc106a0baa421eee60',
 'src/components/three/functionalRenderObservation.ts':'ad1955b3951f9c41e0ac53ae834f39d87debad46614d8636679853886470f445',
});
export function validateRequest(request) { assert.deepEqual(request,expectedRequest,'Exact closed disabled request required'); return structuredClone(request); }
export function authorizeRun(request,env) {
 assert.equal(request.allow,true,'Current render-cost request is disabled pending publication approval');
 assert.equal(env.CI,'true','CI required');assert.equal(env.GITHUB_ACTIONS,'true','GitHub Actions CI required');
 assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(env.GITHUB_REF,'refs/heads/main');
 assert.ok(['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME));
 if(env.GITHUB_EVENT_NAME==='push')assert.ok((env.R35_RENDER_COST_COMMIT_MESSAGE??'').includes('[stage-current-render-cost]'),'Explicit current render-cost activation marker required');
 assert.equal(env.R35_ALLOW_CURRENT_RENDER_COST,'1');assert.ok(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??''));
 assert.ok(expectedRequest.cells.includes(env.R35_RENDER_COST_CELL));validateRequest({...request,allow:false});
 return {cell:env.R35_RENDER_COST_CELL,environment:env.R35_RENDER_COST_CELL.split('-')[0],quality:env.R35_RENDER_COST_CELL.split('-')[1]};
}
export function actionPrefix(cell) {
 assert.ok(expectedRequest.cells.includes(cell));
 const plan=[{id:'select-environment',type:'environment'}];
 const camera=(label,id)=>plan.push({id:`camera-${id}`,type:'camera',label});
 const capture=id=>plan.push({id,type:'capture'});
 const key=(key,count,id)=>plan.push({id:`input-${id}`,type:'key',key,count});
 for(const [id,label]of [['hero','Front ¾'],['front','Front'],['rear','Rear'],['side','Side'],['top','Top detail']]){camera(label,id);capture(id);}
 camera('Front ¾','low-baseline');key('Shift+ArrowDown',12,'low');capture('low');key('Home',1,'home-reset');capture('home-reset');
 for(let i=1;i<=8;i++){key('Shift+ArrowRight',5,`orbit-${i}`);capture(`orbit-${i}`);}
 key('Home',1,'pre-zoom-home');plan.push({id:'pre-zoom-settled',type:'gate'});
 for(const [k,n,id]of [['+',40,'zoom-min'],['+',2,'zoom-min-clamped'],['-',50,'zoom-max'],['-',2,'zoom-max-clamped'],['Home',1,'zoom-reset']]){key(k,n,id);capture(id);}
 return plan;
}
export function expectedDimensions({renderWidth,renderHeight,nativeDpr},quality) {
 assert.ok(['standard','reduced'].includes(quality));for(const n of [renderWidth,renderHeight,nativeDpr])assert.ok(Number.isFinite(n)&&n>0);
 const pixelRatio=Math.min(nativeDpr,1.5,Math.sqrt((quality==='reduced'?1_000_000:2_000_000)/Math.max(1,renderWidth*renderHeight)));
 return {pixelRatio,width:Math.floor(renderWidth*pixelRatio),height:Math.floor(renderHeight*pixelRatio)};
}
export async function verifySources(root) {
 const sourceCommit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(sourceCommit,expectedRequest.sourceCommit);
 assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','Exact source checkout must be clean');
 const paths=[];const walk=async name=>{for(const entry of (await readdir(resolve(root,name),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){assert.ok(!entry.isSymbolicLink(),'Source symlink forbidden');const p=`${name}/${entry.name}`;if(entry.isDirectory())await walk(p);else if(entry.isFile())paths.push(p);}};
 await walk('src');paths.push('index.html','package.json','package-lock.json','vite.config.ts','server.mjs');
 const files=[];for(const path of paths.sort())files.push({path,sha256:hash(await readFile(resolve(root,path)))});
 const source={contract:'r35-production-source-v2-with-index',sha256:hash(JSON.stringify(files)),files};assert.equal(source.sha256,expectedRequest.sourceTree);
 const helpers={};for(const[path,digest]of Object.entries(helperPins)){helpers[path]=hash(await readFile(resolve(root,path)));assert.equal(helpers[path],digest,`Pinned helper drift: ${path}`);}
 return {sourceCommit,source,helpers};
}
const one=(source,from,to)=>{assert.equal(source.split(from).length,2,`Unique reviewed anchor: ${from}`);return source.replace(from,to);};
export function deriveReadiness(bytes) {
 assert.equal(hash(bytes),helperPins['scripts/functional-capture-readiness.mjs']);let source=String(bytes);
 assert.equal(source.split('2_000_000').length,3);source=source.replaceAll('2_000_000','expected.maxBufferPixels');
 source=one(source,'const { camera, vehicle, dimensions: d, pose } = snapshot;',`if (![1_000_000, 2_000_000].includes(expected.maxBufferPixels)) throw new Error('Explicit reviewed quality budget required');\n    const { camera, vehicle, dimensions: d, pose } = snapshot;`);
 source=one(source,'{ preset, timeout }) {','{ preset, timeout, quality }) {');
 source=one(source,'({ preset, timeout }) => {','({ preset, timeout, quality }) => {\n      if (!["standard", "reduced"].includes(quality)) throw new Error("Explicit quality required");');
 source=one(source,'          preset: seat ? "interior" : preset,','          maxBufferPixels: quality === "reduced" ? 1_000_000 : 2_000_000,\n          preset: seat ? "interior" : preset,');
 source=one(source,'    { preset, timeout },','    { preset, timeout, quality },');return source;
}
export function censor(rows,index,failure) {
 assert.ok(Number.isSafeInteger(index)&&index>=0&&index<rows.length);return rows.map((row,i)=>i<index?structuredClone(row):i===index?{...structuredClone(row),status:'failed',failure:structuredClone(failure)}:{...structuredClone(row),status:'blocked',blockedBy:rows[index].id});
}
export const modelPins=Object.freeze([
 {path:'/models/ciasny-r35.glb',bytes:8296356,sha256:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d'},
 {path:'/models/r35-cabin-fine-roughness-ed88ad0e.glb',bytes:20196108,sha256:'ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0'},
 {path:'/models/r35-exterior-cabin-proxy-49d7c2ab.glb',bytes:956368,sha256:'49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347'},
]);
export function completePlan(cell){return [{id:'initial-default-standard',type:'initial'},{id:'original-accessibility-prefix',type:'accessibility'},{id:'actual-quality-selection',type:'quality'},...actionPrefix(cell)];}

export function summarizeInterval(observation,afterSequence,deadline=Infinity) {
 const events=observation.events.filter(e=>e.sequence>afterSequence),passes=observation.passes.filter(p=>p.sequence>afterSequence);
 const input=events.find(e=>e.kind==='input'&&e.trusted),arm=events.find(e=>e.kind==='mark'&&e.phase==='arm');
 const main=events.findLast(e=>e.kind==='main');
 const fences=events.filter(e=>e.kind==='fence').map(f=>({...f,waits:events.filter(e=>e.kind==='wait'&&e.owner===f.owner&&e.id===f.id),retirement:events.find(e=>e.kind==='retire'&&e.owner===f.owner&&e.id===f.id)??null}));
 const native=main&&fences.find(f=>f.owner===main.owner&&f.draws.includes(main.id));
 const positive=native?.waits.find(w=>[0x911a,0x911c].includes(w.status));
 const preInputPasses=input?passes.filter(p=>p.firstCallStartedAt<input.at):[];
 const first=(input?passes.find(p=>p.firstCallStartedAt>=input.at):passes[0])?.firstCallStartedAt??null;
 const groups=passes.map(p=>({framebuffer:p.framebuffer===null?'default':'offscreen',viewport:p.viewport,draws:p.draws,triangles:p.triangles,methods:p.methods??{}}));
 return {afterSequence,beforeSequence:observation.sequence??Math.max(0,...events.map(e=>e.sequence),...passes.map(p=>p.sequence)),preInputPasses,armAt:arm?.at??null,inputAt:input?.at??null,firstSubmissionAt:first,exactAdmissionAt:null,
  admissionMeaning:'First observed scene-context draw submission is only an admission upper bound. No exact application admission event exists. Preparation or unrelated scene work may occur in this interval.',
  unpartitionedInputToFirstSubmissionMs:first!==null&&input?first-input.at:null,mainObservedAt:main?.at??null,
  completionObservedAt:positive?.at??null,censored:!positive||positive.at>=deadline,deadline:Number.isFinite(deadline)?deadline:null,
  submissionToMainObservedMs:first!==null&&main?main.at-first:null,mainToNativeObservedMs:positive&&main?positive.at-main.at:null,
  workload:{passes:passes.length,draws:passes.reduce((n,p)=>n+p.draws,0),triangles:passes.reduce((n,p)=>n+p.triangles,0),groups},
  drawNativeCallMs:passes.reduce((n,p)=>n+p.drawNativeCallMs,0),fences,events,passes,
  limitations:['Observed framebuffer/viewport groups are not semantic render passes or evidence of shadow cost.','CPU native-call wall time and positive native observation latency are not GPU execution time.','No success-only filtering; absent or late native completion stays censored.']};
}
export function validateReport(report) {
 const reasons=[];const check=(condition,label)=>{if(!condition)reasons.push(label);};const equal=(a,b,label)=>{try{assert.deepEqual(a,b);}catch{reasons.push(label);}};
 check(report?.version===1&&report?.contract===expectedRequest.contract,'missing exact report contract');
 check(report?.sourceCommit===expectedRequest.sourceCommit&&report?.sourceTree===expectedRequest.sourceTree,'wrong current source identity');
 check(expectedRequest.cells.includes(report?.cell),'unknown cell');
 equal(report?.models,modelPins,'missing or changed built model bytes');
 check(Array.isArray(report?.modelBodies)&&report.modelBodies.length===modelPins.length,'missing or duplicate actual model responses');
 for(const pin of modelPins){
  const rows=report?.modelBodies?.filter(r=>r.path===pin.path)??[];check(rows.length===1,`exactly one completed actual model response required: ${pin.path}`);
  for(const row of rows)check(row.bytes===pin.bytes&&row.sha256===pin.sha256&&row.status===200&&row.state==='body-completed'&&!row.error,`unverified actual model response: ${pin.path}`);
  for(const collection of [report?.runtimeBodies,report?.bodyLedger?.requests]){const receipts=collection?.filter(r=>r.path===pin.path)??[];check(receipts.length===1&&receipts[0].bytes===pin.bytes&&receipts[0].sha256===pin.sha256&&receipts[0].status===200&&receipts[0].state==='body-completed'&&!receipts[0].error,`missing exact model body/ledger correspondence: ${pin.path}`);}
 }
 check(report?.bodyLedger?.state==='finished','body ledger unfinished or failed');equal(report?.bodyLedger?.errors,[],'body ledger errors');equal(report?.bodyLedger?.lateEvents,[],'body ledger late events');
 try{validateRequest({...report?.request,allow:false});}catch{reasons.push('missing exact dimensions, motion and budgets request');}
 equal(report?.limits,{functionalMs:15000,availabilityMs:90000,captureMs:45000,retries:0},'changed gate budgets');
 const runner=report?.runner;check(Boolean(runner?.hostname&&runner?.runId&&runner?.runAttempt&&runner?.job&&runner?.node&&Array.isArray(runner?.cpuModels)&&runner.cpuModels.length>0&&runner.cpuCount>0),'missing runner identity');
 check(typeof report?.browser?.version==='string'&&report.browser.version.length>0,'missing browser identity');equal(report?.browser?.args,['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'],'changed browser launch arguments');
 const backend=report?.backend;check(Boolean(backend&&/SwiftShader/i.test(backend.renderer)&&backend.antialias===true&&backend.samples>=2&&backend.sampleBuffers>=1&&backend.defaultFramebuffer===true&&backend.nativeDpr===1),'missing actual MSAA/SwiftShader context proof');equal(backend?.viewport,expectedRequest.viewport,'wrong actual viewport');
 check(report?.status==='passed'&&report?.cleanupConfirmed===true,'failed, incomplete or unclosed cell');
 for(const name of ['errors','pageErrors','requestsFailed'])equal(report?.[name],[],`missing or unhealthy ${name}`);
 check(Array.isArray(report?.runtimeBodies)&&report.runtimeBodies.length>0&&report.runtimeBodies.every(r=>r.status===200&&r.state==='body-completed'&&!r.error&&/^[a-f0-9]{64}$/.test(r.sha256??'')&&Number.isSafeInteger(r.bytes)),'missing or unverified runtime body receipts');
 equal(report?.observation?.issues,[],'observer issues or missing observation');check(report?.observation?.dropped===0,'observer dropped records');
 const plan=expectedRequest.cells.includes(report?.cell)?completePlan(report.cell):[];
 equal(report?.steps?.map(({id,type,label,key,count})=>Object.fromEntries(Object.entries({id,type,label,key,count}).filter(([,v])=>v!==undefined))),plan,'incomplete or changed exact action prefix');
 const quality=report?.cell?.split('-')[1],events=report?.observation?.events??[];
 for(const row of report?.steps??[]){
  check(row.status==='passed',`${row.id}: failed or censored`);
  if(row.type==='quality')check(row.selection?.trusted===true&&row.selection?.type==='click'&&row.selection?.target?.name==='render-quality'&&row.selection?.target?.value===quality,`${row.id}: no actual trusted selector input`);
  if(row.type!=='capture')continue;
  try{
   const d=row.dimensions,expected=expectedDimensions({renderWidth:d.renderWidth,renderHeight:d.renderHeight,nativeDpr:1},quality);
   assert.equal(d.cssWidth,1920);assert.equal(d.cssHeight,924);assert.equal(d.renderWidth,1920);assert.equal(d.renderHeight,924);
   for(const[k,v]of Object.entries(expected))assert.equal(d[k],v);
   const c=row.certificate;assert.equal(c.snapshot.live,true);assert.deepEqual(c.snapshot.dimensions,d);assert.ok([0x911a,0x911c].includes(c.nativeStatus));assert.ok([0x911a,0x911c].includes(c.drainNativeStatus));assert.ok(c.readyAt<c.deadline);
   const {dimensions,live,...state}=c.snapshot;assert.deepEqual(row.state,state);assert.ok(state.pose&&state.camera&&state.vehicle?.exterior&&state.vehicle.environment===report.cell.split('-')[0]);
   const main=events.find(e=>e.kind==='main'&&e.owner===c.owner&&e.id===c.mainDrawId);assert.ok(main?.stable);assert.deepEqual(main.snapshot,c.snapshot);
   const fence=events.find(e=>e.kind==='fence'&&e.owner===c.owner&&e.id===c.fenceId);assert.ok(fence?.draws?.includes(c.mainDrawId));
   for(const id of [c.fenceId,c.drainFenceId])assert.ok(events.some(e=>e.kind==='wait'&&e.owner===c.owner&&e.id===id&&[0x911a,0x911c].includes(e.status)&&e.at<c.deadline));
   assert.ok(row.interval&&Array.isArray(row.interval.passes));assert.deepEqual(row.workload,row.interval.workload);
   assert.ok(Number.isSafeInteger(row.interval.afterSequence)&&Number.isSafeInteger(row.interval.beforeSequence)&&row.interval.beforeSequence>=row.interval.afterSequence);
   const observed={sequence:row.interval.beforeSequence,events:events.filter(e=>e.sequence<=row.interval.beforeSequence),passes:(report.observation.passes??[]).filter(p=>p.sequence<=row.interval.beforeSequence)};
   assert.deepEqual(row.interval,summarizeInterval(observed,row.interval.afterSequence,c.deadline),'Timeline must be reproducible from retained raw observation');
   const reuse=c.reusedUnchanged===true;
   if(reuse&&row.workload.draws===0){
    assert.equal(row.measurementKind,'unchanged-completed-baseline');
    const baseId={'zoom-min-clamped':'zoom-min','zoom-max-clamped':'zoom-max'}[row.id];assert.ok(baseId,'Only original clamp endpoints admit zero-work unchanged completion');
    const base=report.steps.find(x=>x.id===baseId);assert.equal(base.status,'passed');
    for(const key of ['owner','mainDrawId','fenceId','drainFenceId','nativeStatus','drainNativeStatus','snapshot'])assert.deepEqual(c[key],base.certificate[key]);
    assert.deepEqual(row.state,base.state);assert.deepEqual(row.dimensions,base.dimensions);assert.deepEqual(row.comparison,base.comparison);assert.equal(row.pngSha256,base.pngSha256);
    assert.equal(row.interval.mainObservedAt,null);assert.equal(row.interval.completionObservedAt,null);
   }else{
    assert.equal(row.measurementKind,'new-native-completion');
    assert.ok(row.workload.passes>0&&row.workload.draws>0&&row.workload.triangles>0,'Changed scene needs positive observed draw workload');
    for(const key of ['firstSubmissionAt','mainObservedAt','completionObservedAt'])assert.ok(Number.isFinite(row.interval[key]),`Missing finite ${key}`);
    assert.ok(row.interval.firstSubmissionAt<=row.interval.mainObservedAt&&row.interval.mainObservedAt<=row.interval.completionObservedAt&&row.interval.completionObservedAt<=c.readyAt&&c.readyAt<c.deadline);
    assert.equal(row.interval.censored,false);assert.ok(row.interval.events.some(e=>e.kind==='main'&&e.owner===c.owner&&e.id===c.mainDrawId));
   }
   for(const pass of row.interval.passes){
    assert.ok(Array.isArray(pass.viewport)&&pass.viewport.length===4&&pass.viewport.every(Number.isFinite)&&pass.viewport[0]>=0&&pass.viewport[1]>=0&&pass.viewport[2]>0&&pass.viewport[3]>0,'Missing actual pass viewport');
    assert.ok(Number.isSafeInteger(pass.draws)&&pass.draws>0&&Number.isSafeInteger(pass.triangles)&&pass.triangles>=0);
    if(pass.framebuffer===null)assert.deepEqual(pass.viewport,[0,0,d.width,d.height],'Default draw viewport must equal certified quality buffer');
   }
   assert.equal(row.workload.passes,row.interval.passes.length);assert.equal(row.workload.draws,row.interval.passes.reduce((n,p)=>n+p.draws,0));assert.equal(row.workload.triangles,row.interval.passes.reduce((n,p)=>n+p.triangles,0));assert.equal(row.workload.groups.length,row.workload.passes);
   assert.equal(row.pixels.blank,false);assert.match(row.pngSha256,/^[a-f0-9]{64}$/);assert.match(row.comparison.sha256,/^[a-f0-9]{64}$/);assert.ok(row.comparison.layout&&row.comparison.comparedPixels>row.comparison.canvasPixels/2);assert.ok(Number.isFinite(row.captureElapsedMs)&&row.captureElapsedMs>=0&&row.captureElapsedMs<=45000);
  }catch(error){reasons.push(`${row.id}: incomplete actual native/state/dimension/pixel/workload proof: ${error.message}`);}
 }
 return reasons;
}
export function comparePair(a,b) {
 const reasons=[...validateReport(a).map(r=>`Standard: ${r}`),...validateReport(b).map(r=>`Reduced: ${r}`)];
 const equal=(left,right,label)=>{try{assert.deepEqual(left,right);}catch{reasons.push(label);}};
 equal(a.cell?.split('-')[0],b.cell?.split('-')[0],'environment differs');
 if(a.cell?.split('-')[1]!=='standard'||b.cell?.split('-')[1]!=='reduced')reasons.push('Standard/Reduced pair required');
 equal(a.backend,b.backend,'actual renderer/MSAA identity differs');equal(a.runner,b.runner,'runner identity differs');equal(a.browser,b.browser,'browser identity differs');
 const bodies=report=>(report.runtimeBodies??[]).map(({path,bytes,sha256,status,error})=>({path,bytes,sha256,status,...(error?{error}:{})})).sort((x,y)=>x.path.localeCompare(y.path));
 equal(bodies(a),bodies(b),'actual runtime resource workloads differ');
 const workload=row=>({...row.workload,groups:row.workload?.groups?.map(g=>({...g,viewport:g.framebuffer==='default'?'quality-dependent actual buffer':g.viewport}))});
 const endpoints=(a.steps??[]).filter(x=>x.type==='capture').map(left=>{const right=b.steps?.find(x=>x.id===left.id),issues=[];
  if(left.status!=='passed'||right?.status!=='passed')issues.push('failed, missing or censored endpoint');
  try{assert.deepEqual(left.state,right?.state);}catch{issues.push('actual render state differs');}
  try{assert.deepEqual(workload(left),workload(right??{}));}catch{issues.push('pass/draw/triangle/offscreen workload differs');}
  if(!left.dimensions||!right?.dimensions||left.dimensions.width*left.dimensions.height<=right.dimensions.width*right.dimensions.height)issues.push('missing actual pixel reduction');
  if(issues.length)reasons.push(`${left.id}: ${issues.join('; ')}`);return {id:left.id,comparable:issues.length===0,issues};});
 return {comparable:reasons.length===0,reasons,endpoints,cells:[structuredClone(a),structuredClone(b)],claim:'Single-run software-renderer discriminator only. No hardware FPS, GPU execution time or causal benefit established.'};
}
