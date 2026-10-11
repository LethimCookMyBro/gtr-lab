/** Synthetic full-run replay fixture. These are unit-test records, never native evidence. */
import{createHash}from'node:crypto';import{ledger}from'./transport-ledger.mjs';import{createCabinOracle}from'../../scripts/causal-cabin-model.mjs';import{motionModelsForSource}from'../../scripts/dpr-motion-policy.mjs';
import{sourcePin}from'../../scripts/causal-motion-preflight.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),clone=structuredClone;
const labels=['01-exterior-before','02-orbit-mid','03-orbit-end','04-controls-mid','05-controls-end','06-exterior-idle','07-cabin-driver','08-cabin-look-mid','09-cabin-look-end','10-cabin-seats','11-cabin-idle','12-resized-look','13-resized-idle'];
const captureAfter=[0,27,81,88,94,96,98,125,169,175,176,205,206];
export function fixture(historical){
 const rows=ledger(),inputs=[],events=[{kind:'attach',owner:1,at:0}],seatCommits=[],transactions=[];
 const transform={scale:1,position:[0,0,0]},controllerModelSha256='a'.repeat(64);
 const geometry=(w,h)=>{const pixelRatio=Math.min(1.5,Math.sqrt(2e6/(w*h)));return{cssWidth:w,cssHeight:h,renderWidth:w,renderHeight:h,pixelRatio,width:Math.floor(w*pixelRatio),height:Math.floor(h*pixelRatio)};};
 const config={transform,controllerModelSha256,bundlePins:{'/index.html':sha('html'),'/assets/fixture.js':sha('bundle')},geometry:{initial:geometry(1440,744),resized:geometry(1280,644)}};
 const oracle=createCabinOracle(transform),initial=createCabinOracle(transform);initial.reset('driver');
 let dims=config.geometry.initial,lights=false,seat=null,shift=0;
 let state={live:true,camera:{preset:'hero',cabin:false,requestId:0,target:initial.state.target,destination:initial.state.eye,targetFov:72,settled:true},vehicle:{cabinSeat:null,lights:false,exterior:true,full:false,proxy:true,lamps:[{role:'headlights',emissive:[1,1,1],intensity:0}]},pose:initial.expected(1440,744).pose,dimensions:clone(dims)};
 const update=()=>{if(oracle.state){const e=oracle.expected(dims.renderWidth,dims.renderHeight);state={live:true,camera:{preset:'interior',cabin:true,requestId:0,target:e.target,destination:e.destination,targetFov:e.fov,settled:true},vehicle:{cabinSeat:seat,lights,exterior:true,full:true,proxy:false,lamps:[{role:'headlights',emissive:[1,1,1],intensity:lights?3:0}]},pose:e.pose,dimensions:clone(dims)};}else{state.vehicle.lights=lights;state.vehicle.lamps[0].intensity=lights?3:0;}};
 const phaseAt=i=>i===0?'exterior-idle-before':i<=81?'exterior-orbit':i<=95?'exterior-controls-rotating':i===96?'exterior-idle-after':i<=98?'cabin-entry':i<=169?'cabin-look':i<=175?'cabin-seat-controls':i===176?'cabin-idle':i<=178?'viewport-change':i<=205?'resized-cabin-look':'resized-cabin-idle';
 rows.forEach((c,index)=>{
  c.startedAt+=shift;c.endedAt+=shift;const phase=phaseAt(index);let type,other={};
  if(c.path.includes('.mouse.')){type={move:'pointermove',down:'pointerdown',up:'pointerup'}[c.path.split('.').at(-1)];other={canvasTarget:true,clientX:c.args[0]??200,clientY:c.args[1]??120,pointerId:1};}
  else if(c.path.endsWith('.press')){type='keydown';other={canvasTarget:true,key:c.args[0]};}
  else if(c.path.endsWith('.click')){type='click';other={canvasTarget:false,button:JSON.parse(c.path.match(/getByRole\((.*)\)\.click/)[1])[1].name};}
  if(type){
   const record={ordinal:inputs.length+1,type,isTrusted:true,receivedAt:c.startedAt+.1,bubbleAt:c.startedAt+.8,owner:1,phase,pre:clone(state),effect:'receipt-only',...other};inputs.push(record);
   if(other.canvasTarget){record.expectedEffect=oracle.input(record);record.expected=oracle.expected(dims.renderWidth,dims.renderHeight);const preMatch=oracle.compare(record.pre,dims.renderWidth,dims.renderHeight);update();record.post=clone(state);if(record.expectedEffect.applied){record.effect=preMatch?'no-op-consumption-unproven':'independent-physical-effect-observed';record.appliedObservedAt=preMatch?null:record.bubbleAt;}}
   else{
    if(record.button==='Lights'){lights=!lights;update();}
    const requestedSeat=({'Cabin preview · work in progress':'driver',Driver:'driver',Passenger:'passenger','Rear seat':'rear'})[record.button];
    if(requestedSeat){record.requestedSeat=requestedSeat;const changed=seat!==requestedSeat;seat=requestedSeat;oracle.reset(seat);update();record.seatObservation=changed?'changed-logical-seat-observed':'already-matching-consumption-unproven';seatCommits.push({inputOrdinal:record.ordinal,seat,at:c.startedAt+.5,owner:1,snapshot:clone(state),logicalChangeObserved:changed,interpretation:changed?'logical-seat-and-destination-committed; presentation-unproven':'already-matching-seat; consumption-and-presentation-unproven'});}
    record.post=clone(state);
   }
  }
  if(c.path.endsWith('setViewportSize')){dims=config.geometry.resized;oracle.reset(seat);update();events.push({kind:'oracle-reset',reason:'original-viewport-command',owner:1,seat,phase:'viewport-change',inputOrdinal:inputs.length,at:c.endedAt});}
  if(captureAfter.includes(index)){
   const i=transactions.length,label=labels[i],t=c.endedAt,id=i+1;
   const draw={kind:'main',owner:1,id,at:t+1,stable:true,bufferGeneration:1,snapshot:clone(state),completion:{fenceId:id,status:0x911a,at:t+3}};
   const drain={kind:'fence',owner:1,id,at:t+2,draws:[id],previous:null,prefixDrawMax:id,status:0x911a,observedAt:t+3,retired:'signaled'};
   events.push({kind:'main',owner:1,id,at:t+1,stable:true,snapshot:clone(state)},{kind:'fence',owner:1,id,at:t+2,draws:[id],previous:null},{kind:'wait',owner:1,id,at:t+3,status:0x911a},{kind:'retire',owner:1,id,at:t+3.5,reason:'signaled'});
   const before={at:t+4,owner:1,bufferGeneration:1,inputOrdinal:inputs.length,lastDraw:draw,latestDrain:drain,state:clone(state),expected:oracle.expected(dims.renderWidth,dims.renderHeight),pendingDemand:false,pointerDown:false,invalidations:[]};
   const pixels={label,blank:false,pixels:1000,sha256:sha('png-'+i),scene:{sha256:sha('pixels-'+i),layout:'same-scene-mask'}};
   transactions.push({label,supported:i>=6,invokedAt:t,absoluteDeadline:t+90000,attempts:[{startedAt:t,deadline:t+45000,api:'page.screenshot',pngStartedAt:t+5,pngEndedAt:t+6,endedAt:t+8,outcome:'captured'}],evidenceFinishedAt:t+9,before,after:{valid:true,after:{...clone(before),at:t+7},certificate:{reusedUnchanged:false}},pixels,result:i>=6?'stable-cabin-endpoint-observed':'unresolved-exterior-or-moving-pose'});
   shift+=20;
  }
 });
 const chronological=[...inputs.map(value=>({value,at:value.receivedAt})),...events.map(value=>({value,at:value.at}))].sort((a,b)=>a.at-b.at);chronological.forEach(({value},i)=>value.sequence=i+1);
 for(const transaction of transactions)for(const snapshot of[transaction.before,transaction.after.after])snapshot.sequence=chronological.filter(e=>e.at<=snapshot.at).at(-1)?.value.sequence??0;
 return{config,causal:{contract:'r35-causal-observed-effect-v1',timeOrigin:1700000000000,transform,controllerModel:controllerModelSha256,inputs,events,invalidations:[],seatCommits},transactions,transportLedger:rows,report:{viewport:'desktop',sourceCommit:sourcePin.commit,result:'passed',assessment:{failures:[]},runtimeBodies:motionModelsForSource(sourcePin.tree).map(model=>({...model,status:200})),runtimeBundleBodies:[{path:'/index.html',sha256:sha('html'),status:200},{path:'/assets/fixture.js',sha256:sha('bundle'),status:200}],pageErrors:[],requestFailures:[],captures:transactions.map(t=>t.pixels)},source:{sha256:sourcePin.tree},causalRequest:{sourceSha:sourcePin.commit,sourceTree:sourcePin.tree,files:{'evidence/desktop-original-report.json':sha(historical),'scripts/causal-cabin-model.mjs':controllerModelSha256}},historical};
}
