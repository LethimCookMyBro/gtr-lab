/** Independent artifact replay. Does not trust summary flags or producer-applied epochs. */
import {isDeepStrictEqual as equal} from 'node:util';
import {createCabinOracle} from './causal-cabin-model.mjs';
const ordered=(...v)=>v.every(x=>Number.isFinite(x)&&x>=0)&&v.every((x,i)=>i===0||x>=v[i-1]);
const positive=x=>x===0x911a||x===0x911c;
const tuple=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>Number.isFinite(x)&&Math.abs(x-b[i])<=1e-8);
const seatForButton=button=>({'Cabin preview · work in progress':'driver',Driver:'driver',Passenger:'passenger','Rear seat':'rear'})[button]??null;
const phases={'07-cabin-driver':'cabin-entry','08-cabin-look-mid':'cabin-look','09-cabin-look-end':'cabin-look','10-cabin-seats':'cabin-seat-controls','11-cabin-idle':'cabin-idle','12-resized-look':'resized-cabin-look','13-resized-idle':'resized-cabin-idle'};
export function replayCausalEvidence({causal,transactions,config}){
 const failures=[],byLabel=new Map(),oracle=createCabinOracle(config.transform),physicalEffects=new Map(),seatObservations=new Map();
 const owners=new Map();let lights=false;
 const check=(ok,message)=>{if(!ok)failures.push(message);return ok;};
 check(equal(causal.transform,config.transform),'Raw model transform differs from independently derived source model');
 check(causal.controllerModel===config.controllerModelSha256,'Raw controller model differs from reviewed independent model');
 const segmentFor=ordinal=>transactions.find((t,i)=>ordinal<=(t.before?.inputOrdinal??-1)&&ordinal>(transactions[i-1]?.before?.inputOrdinal??0));
 const timeline=[...causal.inputs.map(value=>({type:'input',at:value.receivedAt,value})),...causal.seatCommits.map(value=>({type:'seat',at:value.at,value})),...causal.events.map(value=>({type:'native',at:value.at,value})),...transactions.map(value=>({type:'capture',at:value.before?.at,value}))].sort((a,b)=>a.at-b.at||({input:0,seat:1,native:2,capture:3}[a.type]-({input:0,seat:1,native:2,capture:3}[b.type])));
 for(const item of timeline){
  const v=item.value;
  if(item.type==='input'){
   const segment=segmentFor(v.ordinal),requiredPhase=phases[segment?.label];
   if(requiredPhase)check(v.phase===requiredPhase,`Input ${v.ordinal}: missing/wrong original cabin phase`);
   if(v.type==='click'){const intendedSeat=seatForButton(v.button);check((v.requestedSeat??null)===intendedSeat,`Input ${v.ordinal}: native button/requested seat mismatch`);if(v.button==='Lights')lights=!lights;}
   if(!v.canvasTarget||!requiredPhase)continue;
   const result=oracle.input(v);
   check(equal(v.expectedEffect,result),`Input ${v.ordinal}: missing/incorrect independent effect record`);
   if(result.applied){
    const d=v.pre?.dimensions;
    const matchPre=d&&oracle.compare(v.pre,d.renderWidth,d.renderHeight),matchPost=d&&oracle.compare(v.post,d.renderWidth,d.renderHeight);
    check(!!v.post&&ordered(v.receivedAt,v.bubbleAt)&&matchPost,`Input ${v.ordinal}: independent physical post-state not established`);
    check(equal(v.pre?.vehicle,v.post?.vehicle)&&equal(v.pre?.dimensions,v.post?.dimensions),`Input ${v.ordinal}: unrelated state changed in receipt interval`);
    const effect=matchPost?(matchPre?'no-op-consumption-unproven':'independent-physical-effect-observed'):'expected-physical-effect-missing';
    check(v.effect===effect,`Input ${v.ordinal}: claimed physical effect differs from replay`);
    physicalEffects.set(v.ordinal,{input:v,effect,expected:oracle.expected(d?.renderWidth,d?.renderHeight)});
   }
  }else if(item.type==='seat'){
   const input=causal.inputs.find(i=>i.ordinal===v.inputOrdinal),nextSeat=causal.inputs.find(i=>i.ordinal>v.inputOrdinal&&i.requestedSeat),s=v.snapshot;
   const valid=check(input?.requestedSeat===v.seat&&ordered(input?.receivedAt,v.at)&&(!nextSeat||v.at<=nextSeat.receivedAt),`Seat ${v.inputOrdinal}: unbound, late or superseded logical observation`);
   const model=createCabinOracle(config.transform);model.reset(v.seat);const e=model.expected(s?.dimensions?.renderWidth,s?.dimensions?.renderHeight);
   const stateValid=check(s?.vehicle?.cabinSeat===v.seat&&s?.camera?.cabin===true&&tuple(s.camera.destination,e.destination)&&tuple(s.camera.target,e.target)&&s.camera.targetFov===e.fov,`Seat ${v.inputOrdinal}: independent committed target missing`);
   check(!seatObservations.has(v.inputOrdinal),`Seat ${v.inputOrdinal}: duplicate commit`);
   const changed=input?.pre?.vehicle?.cabinSeat!==v.seat;check(v.logicalChangeObserved===changed,`Seat ${v.inputOrdinal}: logical change/unchanged claim differs from prior committed state`);
   if(valid&&stateValid){oracle.reset(v.seat);seatObservations.set(v.inputOrdinal,{...v,logicalChangeObserved:changed});}
  }else if(item.type==='native'){
   if(v.kind==='oracle-reset'){
    check(v.reason==='original-viewport-command'&&v.phase==='viewport-change'&&oracle.state?.seat===v.seat,'Unbound independent resize reset');
    if(oracle.state)oracle.reset(oracle.state.seat);continue;
   }
   if(v.kind==='attach'){
    check(!owners.has(v.owner)&&owners.size===0,'Replaced/duplicate native owner');owners.set(v.owner,{draws:new Map(),fences:new Map(),latestDraw:0,latestFence:0,buffer:1,pendingDraws:[]});continue;
   }
   const o=owners.get(v.owner);if(!check(!!o,`Native ${v.kind}: unknown owner`))continue;
   if(v.kind==='buffer-write'){o.buffer++;check(v.bufferGeneration===o.buffer,'Buffer generation differs from native writes');}
   else if(v.kind==='main'){
    check(v.id>o.latestDraw&&!o.draws.has(v.id),'Duplicate/regressed native main draw');
    o.draws.set(v.id,{...v,bufferGeneration:o.buffer,expected:oracle.expected(v.snapshot?.dimensions?.renderWidth,v.snapshot?.dimensions?.renderHeight),modelMatches:oracle.compare(v.snapshot,v.snapshot?.dimensions?.renderWidth,v.snapshot?.dimensions?.renderHeight)});o.latestDraw=v.id;o.pendingDraws.push(v.id);
   }else if(v.kind==='fence'){
    const prior=v.previous===null?null:o.fences.get(v.previous);
    check(v.id>o.latestFence&&!o.fences.has(v.id)&&(v.previous===null||!!prior),'Duplicate/regressed/missing native fence');
    const expected=[...(prior?.draws??[]),...o.pendingDraws];check(equal(v.draws,expected),'Native fence omitted or invented main ancestry');
    o.fences.set(v.id,{...v,prefixDrawMax:o.latestDraw,status:null,retired:null});o.pendingDraws=[];o.latestFence=v.id;
   }else if(v.kind==='wait'){
    const f=o.fences.get(v.id);if(!check(!!f,'Native wait without fence'))continue;
    f.status=v.status;f.observedAt=v.at;if(positive(v.status))f.completedAt=v.at;
    check(v.status!==0x911d,'Native WAIT_FAILED');
   }else if(v.kind==='retire'){
    const f=o.fences.get(v.id);if(!check(!!f,'Native retirement without fence'))continue;f.retired=v.reason;
    check(['superseded','signaled'].includes(v.reason),'Native fence cancelled/invalid retirement');
   }else if(['invalid','stop','buffer-replaced'].includes(v.kind))check(false,`Invalid native owner state: ${v.kind}`);
  }else if(item.type==='capture'&&Object.hasOwn(phases,v.label)){
   const b=v.before,o=owners.get(b?.owner),d=o?.draws.get(b?.lastDraw?.id),f=o?.fences.get(o?.latestFence),c=o?.fences.get(b?.lastDraw?.completion?.fenceId),s=b?.state;
   const local=[],need=(ok,message)=>{if(!ok)local.push(message);};
   const after=v.after?.after;
   need(Number.isSafeInteger(b?.sequence)&&b.sequence>0&&Number.isSafeInteger(after?.sequence)&&after.sequence>=b.sequence,'Capture sequence certificate missing or regressed');
   for(const endpoint of[b,after]){const latest=causal.inputs.filter(input=>input.sequence<=endpoint?.sequence&&input.receivedAt<=endpoint?.at).at(-1)?.ordinal??0;need(endpoint?.inputOrdinal===latest,'Capture input ordinal differs from latest raw trusted receipt');}
   const intervention=causal.events.find(event=>event.sequence>b?.sequence&&event.sequence<=after?.sequence&&['attach','main','fence','buffer-write','buffer-replaced','invalid','stop','oracle-reset'].includes(event.kind));
   const interveningInput=causal.inputs.find(input=>input.sequence>b?.sequence&&input.sequence<=after?.sequence);
   const hiddenBySequence=causal.events.find(event=>event.at>b?.at&&event.at<=after?.at&&['attach','main','fence','buffer-write','buffer-replaced','invalid','stop','oracle-reset'].includes(event.kind));
   const hiddenInput=causal.inputs.find(input=>input.receivedAt>b?.at&&input.receivedAt<=after?.at);
   need(!intervention&&!interveningInput&&!hiddenBySequence&&!hiddenInput,'Raw owner/main/fence/buffer/input changed inside capture bracket');
   need(!!o&&o.latestDraw===d?.id&&o.buffer===b?.bufferGeneration&&d?.bufferGeneration===o.buffer,'Selected main/default-buffer is not current native lineage');
   need(!!d&&d.stable===true&&d.modelMatches&&equal(d.snapshot,s),'Selected native main does not match independently replayed cabin state');
   const target=oracle.expected(s?.dimensions?.renderWidth,s?.dimensions?.renderHeight);
   need(s?.camera?.preset==='interior'&&s?.camera?.cabin===true&&!!target&&tuple(s.camera.destination,target.destination)&&tuple(s.camera.target,target.target)&&s.camera.targetFov===target.fov,'Committed cabin camera controls differ from independently replayed seat model');
   need(!!c&&c.draws.includes(d?.id)&&positive(c.status)&&['signaled',null].includes(c.retired)&&ordered(d?.at,c.at,c.completedAt,b?.at),'Raw main completion fence/wait is missing or not causal');
   need(!!f&&f.id===b?.latestDrain?.id&&f.prefixDrawMax>=d?.id&&positive(f.status)&&['signaled',null].includes(f.retired)&&ordered(d?.at,f.at,f.completedAt,b?.at),'Raw latest native drain is not completed');
   const geometry=config.geometry[v.label.startsWith('12-')||v.label.startsWith('13-')?'resized':'initial'];
   need(s&&Object.entries(geometry).every(([key,value])=>s.dimensions?.[key]===value),'Independent original capture geometry differs');
   const lamps=s?.vehicle?.lamps;
   need(s?.vehicle?.cabinSeat===oracle.state?.seat&&s?.vehicle?.lights===lights&&s?.vehicle?.exterior===true&&s?.vehicle?.full===true&&s?.vehicle?.proxy===false&&Array.isArray(lamps)&&lamps.length>0&&lamps.every(l=>Number.isFinite(l.intensity)&&l.intensity===(lights?(l.role==='headlights'?3:l.role==='taillight-lens'?.92:lamps.some(l=>l.role==='taillight-lens')?.14:2):0)),'Independent seat/vehicle/light material state missing');
   const index=transactions.indexOf(v),start=transactions[index-1]?.before?.inputOrdinal??0,end=b?.inputOrdinal;
   const segment=causal.inputs.filter(i=>i.ordinal>start&&i.ordinal<=end);
   const look=segment.filter(i=>physicalEffects.has(i.ordinal));
   for(const input of look)need(physicalEffects.has(input.ordinal)&&physicalEffects.get(input.ordinal).effect!=='expected-physical-effect-missing',`Cabin input ${input.ordinal} has no independent observed effect`);
   const finalLook=look.at(-1);if(finalLook)need(d?.at>=finalLook.bubbleAt,'Main precedes final observed cabin input');
   const finalSeat=segment.filter(i=>i.requestedSeat).at(-1);
   if(finalSeat){const commit=seatObservations.get(finalSeat.ordinal);need(!!commit&&ordered(finalSeat.receivedAt,commit.at,d?.at),'Main precedes/misses final seat request and committed target');}
   if(['07-cabin-driver','10-cabin-seats'].includes(v.label))need(!!finalSeat,'Missing original final seat request');
   if(['08-cabin-look-mid','09-cabin-look-end','12-resized-look'].includes(v.label))need(!!finalLook,'Missing original final cabin look effect');
   byLabel.set(v.label,{failures:local,independentExpected:d?.expected??null,rawMainCompletion:c??null,rawDrain:f??null});
  }
 }
 const resets=causal.events.filter(event=>event.kind==='oracle-reset');
 check(resets.length===1&&ordered(transactions[10]?.after?.after?.at,resets[0]?.at,transactions[11]?.before?.at),'Exact original resize model boundary missing or reordered');
 return {failures,byLabel};
}
