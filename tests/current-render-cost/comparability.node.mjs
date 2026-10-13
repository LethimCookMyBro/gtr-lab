import test from 'node:test';import assert from 'node:assert/strict';
import {comparePair,completePlan,expectedRequest,modelPins,expectedDimensions,validateReport,summarizeInterval,nativeCabinModel} from '../../scripts/current-render-cost-policy.mjs';
function fixture(quality){
 const dimensions={...expectedDimensions({renderWidth:1920,renderHeight:924,nativeDpr:1},quality),cssWidth:1920,cssHeight:924,renderWidth:1920,renderHeight:924};
 const state={pose:{position:[1,2,3],quaternion:[0,0,0,1],projection:Array(16).fill(1)},camera:{preset:'hero',settled:true},vehicle:{environment:'studio',exterior:true}};
 const report={version:1,contract:expectedRequest.contract,cell:`studio-${quality}`,sourceTree:expectedRequest.sourceTree,sourceCommit:expectedRequest.sourceCommit,models:structuredClone(modelPins),modelBodies:modelPins.map(pin=>({...pin,status:200,state:'body-completed'})),
  status:'passed',cleanupConfirmed:true,runner:{hostname:'one-runner',runId:'1',runAttempt:'1',job:'four-cells',cpuModels:['one-cpu'],cpuCount:2,node:'v24'},browser:{version:'153',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']},request:{...structuredClone(expectedRequest),allow:true},limits:{functionalMs:15000,availabilityMs:90000,captureMs:45000,retries:0},backend:{renderer:'SwiftShader',antialias:true,samples:4,sampleBuffers:1,defaultFramebuffer:true,nativeDpr:1,viewport:{width:1920,height:1080}},errors:[],pageErrors:[],requestsFailed:[],runtimeBodies:[{path:'/index.html',status:200,state:'body-completed',sha256:'a'.repeat(64),bytes:42},...modelPins.map(pin=>({...pin,status:200,state:'body-completed'}))],bodyLedger:{state:'finished',errors:[],lateEvents:[],requests:modelPins.map(pin=>({...pin,status:200,state:'body-completed'}))},observation:{issues:[],dropped:0,events:[],passes:[],sequence:0},steps:[]};
 const origin='http://127.0.0.1:4178';
 for(const collection of [report.modelBodies,report.runtimeBodies,report.bodyLedger.requests])for(const row of collection){const index=modelPins.findIndex(p=>p.path===row.path);if(index>=0)Object.assign(row,{requestId:index+1,generation:1,url:origin+row.path});}
 report.nativeModelReceipt={version:1,buffers:{maxResourceBufferSize:32*1024*1024,maxTotalBufferSize:128*1024*1024},errors:[],baseUrl:origin,model:structuredClone(nativeCabinModel),native:{requestId:'native-2',url:origin+nativeCabinModel.path,method:'GET',status:200,cached:false,terminal:'finished',requestSequence:1,responseSequence:2,finishedSequence:3,encodedTotalBytes:nativeCabinModel.gzipBytes,headers:{'content-encoding':'gzip','content-length':String(nativeCabinModel.gzipBytes)}},playwright:{requestId:2,generation:1,url:origin+nativeCabinModel.path,method:'GET',status:200,bodyRequested:true},body:{nativeRequestId:'native-2',source:'CDP.Network.getResponseBody',base64Encoded:true,bytes:nativeCabinModel.bytes,sha256:nativeCabinModel.sha256,completedSequence:4}};
 let draw=0;
 for(const step of completePlan(`studio-${quality}`)){
  const row={...step,status:'passed'};
  if(step.type==='quality')row.selection={trusted:true,type:'click',target:{name:'render-quality',value:quality}};
  if(step.type==='capture'){
   const afterSequence=report.observation.sequence,t=++draw*1000,seq=()=>++report.observation.sequence;
   const certificate={owner:1,mainDrawId:draw,fenceId:draw,drainFenceId:draw,nativeStatus:0x911a,drainNativeStatus:0x911a,armedAt:t,readyAt:t+6,deadline:t+15000,reusedUnchanged:false,snapshot:{...state,dimensions,live:true}};
   report.observation.events.push({kind:'mark',phase:'arm',sequence:seq(),at:t},{kind:'input',trusted:true,sequence:seq(),at:t+1});
   const pass={sequence:seq(),owner:1,framebuffer:null,viewport:[0,0,dimensions.width,dimensions.height],firstCallStartedAt:t+2,lastCallEndedAt:t+3,drawNativeCallMs:1,draws:20,triangles:30,methods:{drawElements:20}};report.observation.passes.push(pass);
   report.observation.events.push({kind:'main',sequence:seq(),at:t+4,owner:1,id:draw,stable:true,snapshot:certificate.snapshot},{kind:'fence',sequence:seq(),at:t+4.5,owner:1,id:draw,draws:[draw],previous:null},{kind:'wait',sequence:seq(),at:t+5,owner:1,id:draw,status:0x911a});
   const interval=summarizeInterval(report.observation,afterSequence,certificate.deadline);
   Object.assign(row,{measurementKind:'new-native-completion',state,dimensions,certificate,workload:interval.workload,interval,pixels:{blank:false},comparison:{sha256:'c'.repeat(64),layout:'layout',comparedPixels:1000000,canvasPixels:1774080},pngSha256:'d'.repeat(64),captureElapsedMs:100});
  }report.steps.push(row);
 }return report;
}
test('strict pair requires complete actual source, native, pixel and workload evidence',()=>{const a=fixture('standard'),b=fixture('reduced');assert.ok(validateReport,'Missing strict validation');assert.deepEqual(validateReport(a),[]);assert.equal(comparePair(a,b).comparable,true);});
test('equal absence, empty prefixes, wrong models, missing dimensions or native proof cannot become comparable',()=>{
 assert.equal(comparePair({cell:'studio-standard',steps:[]},{cell:'studio-reduced',steps:[]}).comparable,false);
 for(const mutate of [r=>delete r.models,r=>{const c=r.steps.find(x=>x.type==='capture');c.interval.passes[0].viewport=null;c.workload.groups[0].viewport=null;},r=>{const c=r.steps.find(x=>x.type==='capture');c.interval.passes=[];c.workload={passes:0,draws:0,triangles:0,groups:[]};c.interval.workload=c.workload;},r=>{for(const c of r.steps.filter(x=>x.type==='capture'))delete c.interval.mainObservedAt;},r=>delete r.runner,r=>delete r.browser,r=>r.modelBodies.pop(),r=>r.modelBodies.push({...r.modelBodies[0]}),r=>r.modelBodies[0].bytes++,r=>r.bodyLedger.state='failed',r=>r.models[0].sha256='b'.repeat(64),r=>r.steps.pop(),r=>delete r.steps.find(x=>x.type==='capture').dimensions,r=>delete r.steps.find(x=>x.type==='capture').certificate,r=>r.backend.samples=0,r=>r.observation.events=[],r=>r.sourceTree='b'.repeat(64),r=>r.steps.find(x=>x.type==='quality').selection.trusted=false,r=>r.observation.dropped=1,r=>r.steps.find(x=>x.type==='capture').captureElapsedMs=45001]){
  const a=fixture('standard'),b=fixture('reduced');mutate(a);mutate(b);assert.equal(comparePair(a,b).comparable,false);
 }
});
test('differing pass or draw counts reject pixel-only causality and all censored rows remain attached',()=>{const a=fixture('standard'),b=fixture('reduced');b.steps.find(x=>x.type==='capture').workload.draws++;assert.equal(comparePair(a,b).comparable,false);b.steps.find(x=>x.id==='zoom-min').status='failed';b.steps.find(x=>x.id==='zoom-min').failure={raw:{lastBatch:{previous:null,status:0x911b}}};const result=comparePair(a,b);assert.equal(result.comparable,false);assert.deepEqual(result.cells[1].steps.find(x=>x.id==='zoom-min').failure.raw,{lastBatch:{previous:null,status:0x911b}});});
test('zero-draw clamp is admitted only as exact prior native/state/pixel reuse',()=>{
 const report=fixture('standard'),row=report.steps.find(x=>x.id==='zoom-min-clamped'),base=report.steps.find(x=>x.id==='zoom-min');
 const after=row.interval.afterSequence,before=row.interval.beforeSequence;
 report.observation.events=report.observation.events.filter(e=>e.sequence<=after||e.sequence>before);report.observation.passes=report.observation.passes.filter(e=>e.sequence<=after||e.sequence>before);
 row.measurementKind='unchanged-completed-baseline';row.certificate={...structuredClone(base.certificate),reusedUnchanged:true,readyAt:row.certificate.readyAt,deadline:row.certificate.deadline};
 row.interval=summarizeInterval({sequence:before,events:report.observation.events.filter(e=>e.sequence<=before),passes:report.observation.passes.filter(e=>e.sequence<=before)},after,row.certificate.deadline);row.workload=row.interval.workload;
 assert.deepEqual(validateReport(report),[]);
 row.comparison={...row.comparison,sha256:'e'.repeat(64)};assert.ok(validateReport(report).length>0);
});
test('every accepted cell requires the shared recorder native identity and late-error receipt',()=>{
 const report=fixture('standard');delete report.nativeModelReceipt;assert.ok(validateReport(report).some(reason=>reason.includes('same-session cabin receipt')),'Missing native receipt must fail closed');
});
test('accepted-cell validator rejects mismatched native request identities and post-body native errors',()=>{
 for(const mutate of [r=>r.nativeModelReceipt.errors.push('late native failure'),r=>r.nativeModelReceipt.body.nativeRequestId='unrelated',r=>r.nativeModelReceipt.playwright.requestId=99,r=>r.nativeModelReceipt.buffers.maxResourceBufferSize=1]){
  const report=fixture('standard');mutate(report);assert.ok(validateReport(report).some(reason=>reason.includes('same-session cabin receipt')));
 }
});
