/** Passive sidecar for the production functional observation seam. No GL calls or render requests. */
export function installCausalMotionObserver(config) {
  const oracle=globalThis.__r35CreateCabinOracle(config.transform);
  const owners=new Map(),events=[],inputs=[],commits=[],invalidations=[];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const same=(a,b)=>{
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>same(value,b[index]));
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
  };
  const now=()=>performance.now();
  const positive=x=>x===0x911a||x===0x911c;
  let ordinal=0, sequence=0, total=0, lights=false, phase='setup', pendingSeat=null, baseline=null, currentCertificate=null;
  const limit=config.maxRecords??32768;
  const append=(array,record)=>{if(total++>=limit){if(!invalidations.includes('observer-overflow'))invalidations.push('observer-overflow');return false;}array.push(record);return true;};
  const current=()=>[...owners.values()].findLast(o=>!o.stopped&&o.canvas===document.querySelector('.scene-stage canvas'));
  const sample=o=>{try{return o&&!o.stopped?clone(o.read()):null;}catch{return null;}};
  const expected=s=>s&&oracle.expected(s.dimensions.renderWidth,s.dimensions.renderHeight);
  const matches=s=>s?.live===true&&oracle.compare(s,s.dimensions.renderWidth,s.dimensions.renderHeight);
  const syncSeat=()=>{
    const o=current(),s=sample(o);if(!s||!pendingSeat)return;
    const seat=pendingSeat.seat;
    if(s.vehicle?.cabinSeat!==seat||!s.camera?.cabin)return;
    const independent=globalThis.__r35CreateCabinOracle(config.transform);independent.reset(seat);
    const e=independent.expected(s.dimensions.renderWidth,s.dimensions.renderHeight);
    const close=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>Math.abs(x-b[i])<=1e-8);
    if(!close(s.camera.destination,e.destination)||!close(s.camera.target,e.target)||s.camera.targetFov!==e.fov)return;
    const changed=pendingSeat.beforeSeat!==seat;
    const record={inputOrdinal:pendingSeat.ordinal,seat,at:now(),owner:o.id,snapshot:s,logicalChangeObserved:changed,interpretation:changed?'logical-seat-and-destination-committed; presentation-unproven':'already-matching-seat; consumption-and-presentation-unproven'};
    append(commits,record);const receipt=inputs.find(input=>input.ordinal===pendingSeat.ordinal);if(receipt)receipt.seatObservation=changed?'changed-logical-seat-observed':'already-matching-consumption-unproven';pendingSeat=null;oracle.reset(seat);
  };
  const observe=event=>{
    const at=now();sequence++;
    if(event.kind==='attach'){
      if(owners.size)invalidations.push('native-owner-replaced');
      owners.set(event.owner,{id:event.owner,canvas:event.canvas,context:event.context,read:event.read,pending:event.pending,draws:new Map(),fences:new Map(),latestDraw:0,latestFence:0,bufferGeneration:1,stopped:false});
      append(events,{kind:'attach',owner:event.owner,at,sequence});return;
    }
    const o=owners.get(event.owner);if(!o||o.stopped){invalidations.push('unknown-or-stopped-owner-event');return;}
    syncSeat();
    const record={...clone(event),at:now(),sequence,phase};append(events,record);
    if(event.kind==='main'){
      const draw={...record,bufferGeneration:o.bufferGeneration,inputOrdinal:ordinal,expected:expected(event.snapshot),matchesIndependentPose:matches(event.snapshot)};
      o.draws.set(event.id,draw);o.latestDraw=event.id;
    }else if(event.kind==='fence'){
      const previous=event.previous===null?null:o.fences.get(event.previous);
      if(event.previous!==null&&(!previous||previous.draws.some(id=>!event.draws.includes(id))))invalidations.push('broken-native-fence-inheritance');
      if(event.draws.some(id=>!o.draws.has(id)))invalidations.push('fence-references-unobserved-main');
      const preceding=o.fences.get(o.latestFence);
      o.fences.set(event.id,{...record,status:null,retired:null,prefixDrawMax:Math.max(0,preceding?.prefixDrawMax??0,...event.draws)});o.latestFence=event.id;
    }else if(event.kind==='wait'){
      const fence=o.fences.get(event.id);if(!fence){invalidations.push('wait-without-native-fence');return;}
      fence.status=event.status;fence.observedAt=record.at;
      if(event.status===0x911d)invalidations.push('native-wait-failed');
      if(positive(event.status))for(const id of fence.draws){const draw=o.draws.get(id);if(draw&&!draw.completion)draw.completion={fenceId:event.id,status:event.status,at:record.at};}
    }else if(event.kind==='retire'){
      const f=o.fences.get(event.id);if(f)f.retired=event.reason;
      if(!['signaled','superseded'].includes(event.reason))invalidations.push(`native-retirement:${event.reason}`);
    }else if(event.kind==='buffer-replaced')invalidations.push('foreign-default-buffer-render');
    else if(event.kind==='invalid')invalidations.push(`producer:${event.reason}`);
    else if(event.kind==='stop'){o.stopped=true;invalidations.push('native-owner-stopped');}
  };
  // Chain native setters after the unchanged original buffer observer. A same-size write clears too.
  for(const property of ['width','height']){
    const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,property);
    if(!descriptor?.set||!descriptor.get){invalidations.push(`missing-canvas-${property}-descriptor`);continue;}
    Object.defineProperty(HTMLCanvasElement.prototype,property,{...descriptor,set(value){
      const o=[...owners.values()].find(o=>o.canvas===this&&!o.stopped);
      descriptor.set.call(this,value);
      if(o){o.bufferGeneration++;append(events,{kind:'buffer-write',owner:o.id,property,value:this[property],bufferGeneration:o.bufferGeneration,at:now(),sequence:++sequence,phase});}
    }});
  }
  const eventRecords=new WeakMap();
  const types=['pointerdown','pointermove','pointerup','pointercancel','keydown','wheel','click'];
  const label=el=>el?.getAttribute?.('aria-label')||el?.textContent?.trim();
  const receive=event=>{
    const o=current();if(!o)return;
    const canvasTarget=event.target===o.canvas;
    const button=event.target?.closest?.('button');
    const name=label(button);
    const seat=event.type==='click'?({'Cabin preview · work in progress':'driver',Driver:'driver',Passenger:'passenger','Rear seat':'rear'}[name]??null):null;
    const relevant=canvasTarget||event.type==='click'&&['Camera','Rotate','Lights'].includes(name)||!!seat;
    if(!relevant)return;
    const record={ordinal:++ordinal,type:event.type,isTrusted:event.isTrusted===true,canvasTarget,button:name??null,pointerId:event.pointerId??null,clientX:event.clientX??null,clientY:event.clientY??null,key:event.key??null,deltaY:event.deltaY??null,receivedAt:now(),owner:o.id,sequence:++sequence,phase,pre:sample(o),effect:'receipt-only',bubbleAt:null};
    append(inputs,record);eventRecords.set(event,record);
    if(!event.isTrusted){invalidations.push('untrusted-relevant-input');return;}
    if(event.type==='click'&&name==='Lights')lights=!lights;
    if(seat){
      if(pendingSeat){const prior=inputs.find(input=>input.ordinal===pendingSeat.ordinal);if(prior){prior.supersededAt=record.receivedAt;prior.seatObservation='superseded-unobserved';}}
      pendingSeat={ordinal:record.ordinal,seat,beforeSeat:record.pre?.vehicle?.cabinSeat??null};record.requestedSeat=seat;record.seatObservation='received-commit-unobserved';
    }
    if(canvasTarget){
      syncSeat();
      const result=oracle.input(record);record.expectedEffect=result;
      record.expected=expected(record.pre);
      record.preAlreadyMatched=matches(record.pre);
    }
  };
  const bubble=event=>{
    const record=eventRecords.get(event);if(!record)return;
    record.bubbleAt=now();record.post=sample(current());
    if(!event.isTrusted||current()?.id!==record.owner||ordinal!==record.ordinal){record.effect='invalid-input-owner';invalidations.push('input-owner-mismatch');return;}
    if(record.canvasTarget&&record.expectedEffect?.applied){
      if(!same(record.pre?.vehicle,record.post?.vehicle)||!same(record.pre?.dimensions,record.post?.dimensions)){record.effect='unrelated-state-mutation';invalidations.push('input-sample-state-interference');return;}
      record.effect=matches(record.post)?(record.preAlreadyMatched?'no-op-consumption-unproven':'independent-physical-effect-observed'):'expected-physical-effect-missing';
      record.appliedObservedAt=record.effect==='independent-physical-effect-observed'?record.bubbleAt:null;
    }
    syncSeat();
  };
  types.forEach(type=>{document.addEventListener(type,receive,true);document.addEventListener(type,bubble,false);});
  // Passive commit evidence, without waiting for or serializing any intermediate request.
  const mutation=new MutationObserver(syncSeat);mutation.observe(document,{subtree:true,attributes:true,attributeFilter:['aria-pressed'],childList:true});
  const snapshot=()=>{
    syncSeat();const o=current(),s=sample(o),draw=o?.draws.get(o.latestDraw),drain=o?.fences.get(o.latestFence);
    return clone({timeOrigin:performance.timeOrigin,at:now(),sequence,owner:o?.id??null,bufferGeneration:o?.bufferGeneration??null,state:s,expected:expected(s),matchesIndependentPose:matches(s),pendingDemand:o?o.pending():null,pointerDown:oracle.pointerDown,inputOrdinal:ordinal,lastDraw:draw??null,latestDrain:drain??null,invalidations});
  };
  const ready=(label,deadline)=>{
    if(now()>=deadline)throw new Error('Causal readiness exceeded original capture attempt deadline');
    const s=snapshot();
    if(s.invalidations.length)throw new Error(`Causal observation invalid: ${s.invalidations.join('; ')}`);
    const d=s.lastDraw,f=s.latestDrain;
    const v=s.state?.vehicle, lamps=v?.lamps;
    const controlsMatch=v?.cabinSeat===oracle.state?.seat&&v?.lights===lights&&v?.exterior===true&&v?.full===true&&v?.proxy===false&&Array.isArray(lamps)&&lamps.length>0&&lamps.every(l=>l.intensity===(lights?(l.role==='headlights'?3:l.role==='taillight-lens'?.92:lamps.some(l=>l.role==='taillight-lens')?.14:2):0));
    const dim=s.state?.dimensions, expectedGeometry=config.geometry[label==='12-resized-look'||label==='13-resized-idle'?'resized':'initial'];
    const geometryMatch=dim&&Object.entries(expectedGeometry).every(([k,v])=>dim[k]===v);
    const idle=['11-cabin-idle','13-resized-idle'].includes(label);
    const prior=baseline;
    const fresh=d&&d.id>(prior?.mainDrawId??0);
    const reused=idle&&prior&&d?.id===prior.mainDrawId&&s.inputOrdinal===prior.inputOrdinal&&same(s.state,prior.state)&&s.bufferGeneration===prior.bufferGeneration;
    const finalEffect=inputs.filter(i=>i.canvasTarget&&i.expectedEffect?.applied).at(-1);
    const finalSeatRequest=inputs.filter(i=>i.requestedSeat).at(-1);
    const finalSeatCommit=finalSeatRequest&&commits.find(c=>c.inputOrdinal===finalSeatRequest.ordinal);
    if(finalSeatRequest&&finalSeatRequest.ordinal>(prior?.inputOrdinal??0)&&(!finalSeatCommit||!d||d.at<finalSeatRequest.receivedAt||d.at<finalSeatCommit.at))return null;
    const badInput=inputs.find(i=>i.ordinal>(prior?.inputOrdinal??0)&&i.canvasTarget&&i.expectedEffect?.applied&&(i.bubbleAt===null||i.effect==='expected-physical-effect-missing'));
    if(!controlsMatch||!geometryMatch||!s.state?.live||!s.state.camera?.settled||!s.matchesIndependentPose||s.pendingDemand||s.pointerDown||!d?.stable||!d.matchesIndependentPose||!same(s.state,d.snapshot)||d.bufferGeneration!==s.bufferGeneration||!d.completion||!f||!positive(f.status)||f.prefixDrawMax<d.id||!['signaled',null].includes(f.retired)||!(fresh||reused)||badInput)return null;
    if(finalEffect&&d.at<finalEffect.receivedAt&&finalEffect.ordinal>(prior?.inputOrdinal??0))return null;
    const last=inputs.filter(i=>i.ordinal>(prior?.inputOrdinal??0)).at(-1);
    const certificate={label,at:s.at,deadline,owner:s.owner,bufferGeneration:s.bufferGeneration,mainDrawId:d.id,completionFenceId:d.completion.fenceId,drainFenceId:f.id,drainStatus:f.status,inputOrdinal:s.inputOrdinal,state:s.state,expected:s.expected,reusedUnchanged:!fresh,lastInputOrdinal:last?.ordinal??null};
    currentCertificate=certificate;return clone(certificate);
  };
  globalThis.__gtrFunctionalCaptureObserver=observe;
  globalThis.__r35CausalMotion={
    version:1,mark(name){phase=name;},snapshot,
    resize(){if(oracle.state){const seat=oracle.state.seat;oracle.reset(seat);append(events,{kind:'oracle-reset',reason:'original-viewport-command',owner:current()?.id,seat,phase,inputOrdinal:ordinal,at:now(),sequence:++sequence});}},
    begin(label,timeout){return {label,invokedAt:now(),deadline:now()+timeout};},
    ready,
    bracket(){return snapshot();},
    finish(label){const s=snapshot(),c=currentCertificate;
      const valid=!!c&&s.at<c.deadline&&s.owner===c.owner&&s.bufferGeneration===c.bufferGeneration&&s.lastDraw?.id===c.mainDrawId&&s.latestDrain?.id===c.drainFenceId&&positive(s.latestDrain?.status)&&s.inputOrdinal===c.inputOrdinal&&!s.pendingDemand&&!s.pointerDown&&same(s.state,c.state)&&!s.invalidations.length;
      if(c?.label===label&&valid)baseline=clone(c);
      else if(!c||c.label!==label)baseline={mainDrawId:s.lastDraw?.id??0,inputOrdinal:s.inputOrdinal,bufferGeneration:s.bufferGeneration,state:s.state};
      currentCertificate=null;return {valid,label,after:s,certificate:c};
    },
    report(){return clone({contract:'r35-causal-observed-effect-v1',timeOrigin:performance.timeOrigin,events,inputs,seatCommits:commits,pendingSeat,invalidations,state:snapshot(),controllerModel:config.controllerModelSha256,transform:config.transform});},
  };
}
