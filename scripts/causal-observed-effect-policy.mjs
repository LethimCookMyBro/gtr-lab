import {createHash}from'node:crypto';
import{isDeepStrictEqual as equal}from'node:util';
import{motionModelsForSource}from'./dpr-motion-policy.mjs';
import{replayCausalEvidence}from'./causal-evidence-replay.mjs';
import{preserveOriginalGate}from'./demand-final-request-policy.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const finiteTime=x=>Number.isFinite(x)&&x>=0;
const ordered=(...values)=>values.every(finiteTime)&&values.every((v,i)=>i===0||v>=values[i-1]);
const positive=x=>x===0x911a||x===0x911c;
const positiveId=x=>Number.isSafeInteger(x)&&x>0;
const supportedLabels=new Set(['07-cabin-driver','08-cabin-look-mid','09-cabin-look-end','10-cabin-seats','11-cabin-idle','12-resized-look','13-resized-idle']);
const samePose=(a,b)=>a&&b&&['position','projection'].every(k=>Array.isArray(a[k])&&Array.isArray(b[k])&&a[k].length===({position:3,projection:16}[k])&&a[k].every((v,i)=>Number.isFinite(v)&&Number.isFinite(b[k][i])&&Math.abs(v-b[k][i])<=1e-8))&&Array.isArray(a.quaternion)&&Array.isArray(b.quaternion)&&a.quaternion.length===4&&b.quaternion.length===4&&[1,-1].some(sign=>a.quaternion.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.quaternion[i])&&Math.abs(v-sign*b.quaternion[i])<=1e-8));
const labels=['01-exterior-before','02-orbit-mid','03-orbit-end','04-controls-mid','05-controls-end','06-exterior-idle','07-cabin-driver','08-cabin-look-mid','09-cabin-look-end','10-cabin-seats','11-cabin-idle','12-resized-look','13-resized-idle'];
export function assessTransportLedger(ledger,viewport){
  const failures=[];let index=0;
  const take=(method,args,button)=>{const row=ledger[index++];if(!row||!row.path.endsWith('.'+method)||args&&!equal(row.args,args)||button&&!row.path.includes(`"name":"${button}"`)||row.outcome!=='completed'||!Number.isFinite(row.startedAt)||!Number.isFinite(row.endedAt)||row.endedAt<row.startedAt)failures.push(`Original transport ${index}: ${method}${button?' '+button:''} mismatch`);return row;};
  const wait=ms=>{const row=take('waitForTimeout',[ms]);if(row&&row.endedAt-row.startedAt<ms-1)failures.push(`Original ${ms}ms wait shortened`);};
  const drag=direction=>{
    const initial=take('move'),p=initial?.args;take('down',[]);
    for(let i=1;i<=12;i++){const row=take('move');if(!p||!equal(row?.args,[p[0]+direction*i*4,p[1]+Math.sin(i/3)*8]))failures.push(`Drag move ${i} differs from original exact deltas`);wait(75);}
    take('up',[]);
  };
  wait(1500);drag(1);drag(-1);drag(1);take('click',[],'Rotate');
  for(let i=0;i<6;i++){take('click',[],'Lights');wait(350);}
  take('click',[],'Rotate');wait(4000);
  take('click',[{timeout:15000}],'Camera');take('click',[{timeout:15000}],'Cabin preview · work in progress');
  drag(1);drag(-1);take('focus',[]);
  for(let i=0;i<8;i++){take('press',[i<4?'ArrowLeft':'ArrowRight']);wait(100);}
  for(const seat of ['Passenger','Rear seat','Driver']){take('click',[],seat);wait(350);}
  wait(4000);take('setViewportSize',[viewport==='mobile'?{width:430,height:900}:{width:1280,height:800}]);wait(1000);drag(1);wait(4000);
  if(index!==ledger.length)failures.push('Unexpected extra transport actions');
  for(let i=1;i<ledger.length;i++)if(ledger[i].startedAt<ledger[i-1].endedAt)failures.push('Overlapping/reordered transport');
  return{result:failures.length?'insufficient':'original-transport-preserved',failures};
}
function assessObservedEffectRunChecked({causal,transactions,transportLedger,report,source,causalRequest,historical,config}){
  const transport=assessTransportLedger(transportLedger,report.viewport),failures=[...transport.failures];
  const original=preserveOriginalGate(historical,causalRequest.files[`evidence/${report.viewport}-original-report.json`]);
  if(!equal(transactions.map(t=>t.label),labels))failures.push('Exactly thirteen original capture transactions required');
  if(!equal(report.captures.map(c=>c.label),labels))failures.push('Exactly thirteen returned original PNGs required');
  if(causal.invalidations.length)failures.push(...causal.invalidations);
  if(causal.contract!=='r35-causal-observed-effect-v1'||!finiteTime(causal.timeOrigin)||causal.timeOrigin<=0)failures.push('Missing actual causal session contract/time origin');
  for(const [i,input]of causal.inputs.entries()){
    if(input.ordinal!==i+1||!positiveId(input.owner)||input.isTrusted!==true||!ordered(input.receivedAt,input.bubbleAt))failures.push(`Input ${i}: malformed trusted ordinal/owner/receipt chronology`);
    if(i>0&&input.receivedAt<causal.inputs[i-1].receivedAt)failures.push(`Input ${i}: receipt time regressed`);
    if(['pointermove','pointerdown','pointerup'].includes(input.type)&&(!Number.isFinite(input.clientX)||!Number.isFinite(input.clientY)||!positiveId(input.pointerId)))failures.push(`Input ${i}: malformed native pointer identity/coordinates`);
  }
  for(const [i,event]of causal.events.entries())if(!finiteTime(event.at)||!positiveId(event.owner)||(i>0&&event.at<causal.events[i-1].at))failures.push(`Native event ${i}: malformed/reordered chronology`);
  if(source.sha256!==causalRequest.sourceTree||report.sourceCommit!==causalRequest.sourceSha)failures.push('Reviewed source mismatch');
  const requiredModels=motionModelsForSource(source.sha256);
  if(!Array.isArray(report.runtimeBodies)||!requiredModels.every(model=>report.runtimeBodies.some(record=>record.path===model.path&&record.sha256===model.sha256&&record.bytes===model.bytes&&record.status===200&&!record.error))||report.runtimeBodies.some(record=>{const model=requiredModels.find(m=>m.path===record.path);return !model||record.sha256!==model.sha256||record.bytes!==model.bytes||record.status!==200||record.error;}))failures.push('Source-bound runtime model bodies missing or mismatched');
  if(config.controllerModelSha256!==causalRequest.files['scripts/causal-cabin-model.mjs'])failures.push('Independent model config does not match reviewed collector pin');
  if(!Array.isArray(report.runtimeBundleBodies)||report.runtimeBundleBodies.length<2||!report.runtimeBundleBodies.some(r=>r.path==='/index.html')||!report.runtimeBundleBodies.some(r=>/\.js$/.test(r.path??''))||report.runtimeBundleBodies.some(r=>r.status!==200||r.error||!/^[a-f0-9]{64}$/.test(r.sha256??'')||config.bundlePins?.[r.path]!==r.sha256))failures.push('Original served bundle body verification incomplete');
  if(report.pageErrors?.length||report.requestFailures?.length)failures.push('Browser/page/runtime requests failed');
  const chronological=[...causal.inputs.map(i=>({sequence:i.sequence,at:i.receivedAt})),...causal.events.map(e=>({sequence:e.sequence,at:e.at}))].sort((a,b)=>a.sequence-b.sequence);
  if(chronological.some((entry,i)=>!positiveId(entry.sequence)||!finiteTime(entry.at)||(i>0&&(entry.sequence<=chronological[i-1].sequence||entry.at<chronological[i-1].at))))failures.push('Raw global receipt/native sequence is missing, duplicated or regressed');
  const sceneMouse=causal.inputs.filter(i=>i.canvasTarget&&['pointerdown','pointermove','pointerup'].includes(i.type));
  const expectedMouse=transportLedger.filter(c=>/\.mouse\.(move|down|up)$/.test(c.path));
  if(sceneMouse.length!==expectedMouse.length)failures.push('Native mouse receipt count differs from unchanged generator');
  for(let i=0;i<expectedMouse.length;i++){
    const command=expectedMouse[i],received=sceneMouse[i],type={move:'pointermove',down:'pointerdown',up:'pointerup'}[command.path.split('.').at(-1)];
    if(!received?.isTrusted||received.type!==type||received.bubbleAt===null)failures.push(`Native mouse ${i}: missing trusted dispatched/bubbled event`);
    if(type==='pointermove'&&(!received||!Number.isFinite(received.clientX)||!Number.isFinite(received.clientY)||Math.abs(received.clientX-command.args[0])>1||Math.abs(received.clientY-command.args[1])>1))failures.push(`Native mouse ${i}: coordinate mismatch`);
  }
  const keys=causal.inputs.filter(i=>i.type==='keydown'),keyCommands=transportLedger.filter(c=>c.path.endsWith('.press'));
  if(keys.length!==8||keyCommands.length!==8||keys.some((k,i)=>!k.isTrusted||k.key!==keyCommands[i]?.args[0]||k.bubbleAt===null))failures.push('Native keyboard receipt differs from original generator');
  const desiredClicks=['Rotate',...Array(6).fill('Lights'),'Rotate','Camera','Cabin preview · work in progress','Passenger','Rear seat','Driver'];
  const clicks=causal.inputs.filter(i=>i.type==='click'&&!i.canvasTarget);
  if(!equal(clicks.map(c=>c.button),desiredClicks)||clicks.some(c=>!c.isTrusted||c.bubbleAt===null))failures.push('Native control receipt differs from original generator');
  const replay=replayCausalEvidence({causal,transactions,config});failures.push(...replay.failures);
  const endpoints=transactions.map((transaction,i)=>{
    const local=[...(replay.byLabel.get(transaction.label)?.failures??[])];const p=transaction.pixels,attempt=transaction.attempts?.at(-1),before=transaction.before,after=transaction.after?.after;
    const label=labels[i],supported=supportedLabels.has(label),previous=transactions[i-1];
    if(!p||p.blank!==false||!Number.isSafeInteger(p.pixels)||p.pixels<=0||!/^[a-f0-9]{64}$/.test(p.sha256??'')||!/^[a-f0-9]{64}$/.test(p.scene?.sha256??'')||typeof p.scene?.layout!=='string'||!p.scene.layout)local.push('Missing independently nonblank sampled pixels');
    if(!equal(report.captures[i],p))local.push('Returned PNG metadata differs from original capture record');
    if(!finiteTime(transaction.invokedAt)||transaction.absoluteDeadline!==transaction.invokedAt+90000||!Array.isArray(transaction.attempts)||transaction.attempts.length<1||transaction.attempts.length>2)local.push('Original capture invocation/deadline/attempt count malformed');
    let priorEnd=transaction.invokedAt;
    for(const [n,a]of(transaction.attempts??[]).entries()){
      if(!ordered(priorEnd,a.startedAt,a.pngStartedAt,a.endedAt)||a.deadline!==Math.min(a.startedAt+45000,transaction.absoluteDeadline)||a.api!=='page.screenshot'||(n===0&&a.startedAt!==transaction.invokedAt))local.push('Capture attempt timing or operation provenance malformed');
      if(n<transaction.attempts.length-1){
        if(a.outcome!=='TimeoutError'||a.error?.operation!=='page.screenshot'||a.error?.name!=='TimeoutError'||!/^page\.screenshot: Timeout \d+ms exceeded\./.test(a.error?.message??'')||!(a.pngStartedAt<a.deadline&&a.endedAt>=a.deadline&&a.endedAt<transaction.absoluteDeadline))local.push('Retry was not an actual original screenshot timeout');
      }else if(a.outcome!=='captured'||!ordered(a.startedAt,a.pngStartedAt,a.pngEndedAt,a.endedAt,transaction.evidenceFinishedAt)||!(transaction.evidenceFinishedAt<a.deadline&&transaction.evidenceFinishedAt<transaction.absoluteDeadline))local.push('Original wall-clock capture/evidence deadline not met');
      priorEnd=a.endedAt;
    }
    if(previous&&(!finiteTime(previous.evidenceFinishedAt)||transaction.invokedAt<previous.evidenceFinishedAt))local.push('Capture transactions reordered or overlapping');
    if(supported){
      if(transaction.result!=='stable-cabin-endpoint-observed'||!transaction.after?.valid)local.push('Independent expected pose/native completion/stable bracket not proved');
      const d=before?.lastDraw,f=before?.latestDrain,c=d?.completion;
      if(!positiveId(before?.owner)||before.owner!==after?.owner||before.bufferGeneration!==after?.bufferGeneration||d?.id!==after?.lastDraw?.id||f?.id!==after?.latestDrain?.id||before.inputOrdinal!==after?.inputOrdinal||!equal(before.state,after?.state)||!equal(before.state,d?.snapshot))local.push('Capture did not retain exact observed native state');
      if(!before?.state?.live||!before.state.camera?.settled||before.pendingDemand!==false||before.pointerDown!==false||after?.pendingDemand!==false||after?.pointerDown!==false||before?.invalidations?.length||after?.invalidations?.length||!samePose(before?.state?.pose,before?.expected?.pose))local.push('Invalid independent target, liveness or stable state');
      if(!positiveId(d?.id)||d?.kind!=='main'||d?.owner!==before?.owner||d?.stable!==true||d?.bufferGeneration!==before?.bufferGeneration||!positiveId(c?.fenceId)||!positive(c?.status)||!positiveId(f?.id)||f?.owner!==before?.owner||!positive(f?.status)||f?.prefixDrawMax<d?.id||!['signaled',null].includes(f?.retired)||!ordered(d?.at,c?.at,f?.observedAt,before?.at,after?.at)||f?.id<c?.fenceId)local.push('Missing genuine completed native main/prefix lineage');
      const rawMain=causal.events.filter(event=>event.kind==='main'&&event.owner===before?.owner&&event.id===d?.id);
      const rawFence=causal.events.filter(event=>event.kind==='fence'&&event.owner===before?.owner&&event.id===f?.id);
      const nativeWait=causal.events.find(event=>event.kind==='wait'&&event.owner===before?.owner&&event.id===f?.id&&event.status===f?.status&&event.at===f?.observedAt);
      if(rawMain.length!==1||!equal(rawMain[0]?.snapshot,d?.snapshot)||rawMain[0]?.at!==d?.at||rawFence.length!==1||rawFence[0]?.at!==f?.at||!nativeWait)local.push('Capture native proof absent or duplicated in raw production events');
      const prior=previous?.before,wasIdle=['11-cabin-idle','13-resized-idle'].includes(label);
      if(prior&&(!positiveId(prior.owner)||before?.owner!==prior.owner||before?.bufferGeneration<prior.bufferGeneration||before?.inputOrdinal<prior.inputOrdinal))local.push('Cross-capture owner/buffer/input lineage regressed');
      if(prior&&d?.id<=prior.lastDraw?.id){
        if(!wasIdle||d?.id!==prior.lastDraw?.id||before?.inputOrdinal!==prior.inputOrdinal||before?.bufferGeneration!==prior.bufferGeneration||!equal(before?.state,prior.state)||transaction.after?.certificate?.reusedUnchanged!==true)local.push('Fresh action endpoint reused or regressed native draw');
      }
      if(['08-cabin-look-mid','09-cabin-look-end','10-cabin-seats'].includes(label)&&(!previous?.pixels?.scene||p?.scene?.layout!==previous.pixels.scene.layout||p.scene.sha256===previous.pixels.scene.sha256))local.push('Changed physical target lacks changed scene pixels at identical mask geometry');
    }
    return{label:transaction.label,result:local.length?'insufficient':!supported?'unresolved-exterior-or-moving-pose':'observed-effect-endpoint-only',failures:local,reusedUnchanged:transaction.after?.certificate?.reusedUnchanged??false,nativeMainDraw:before?.lastDraw?.id??null,completion:before?.lastDraw?.completion??null,expected:before?.expected??null,actual:before?.state?.pose??null,scene:p?.scene??null};
  });
  const physicalInputs=causal.inputs.filter(i=>i.expectedEffect?.applied);
  if(physicalInputs.some(i=>['expected-physical-effect-missing','invalid-input-owner'].includes(i.effect)||i.bubbleAt===null))failures.push('A cabin expected physical effect was missing');
  return {contract:'r35-causal-observed-effect-v1',result:failures.length||endpoints.some(e=>e.result==='insufficient')?'insufficient':'narrow-cabin-observed-effect-only',failures,source:{commit:report.sourceCommit,tree:source.sha256},originalGate:original,currentOriginalAssertionsOnCausalRun:{result:report.result,failures:report.assessment?.failures??[]},transport,endpoints,
    inputs:{received:causal.inputs.length,independentlyChangedPhysicalEffect:physicalInputs.filter(i=>i.effect==='independent-physical-effect-observed').length,noOpConsumptionUnproven:physicalInputs.filter(i=>i.effect==='no-op-consumption-unproven').length,seatRequests:causal.inputs.filter(input=>input.type==='click'&&['Cabin preview · work in progress','Driver','Passenger','Rear seat'].includes(input.button)).map(input=>{const commit=causal.seatCommits.find(c=>c.inputOrdinal===input.ordinal);return{inputOrdinal:input.ordinal,seat:({'Cabin preview · work in progress':'driver',Driver:'driver',Passenger:'passenger','Rear seat':'rear'})[input.button],receivedAt:input.receivedAt,observation:input.seatObservation??'received-commit-unobserved',supersededAt:input.supersededAt??null,logicalChangeObserved:commit?.logicalChangeObserved??false,presentation:'not-established'};}),seatCommits:causal.seatCommits.map(s=>({seat:s.seat,inputOrdinal:s.inputOrdinal,at:s.at,logicalChangeObserved:s.logicalChangeObserved,interpretation:s.interpretation,presentation:'not-established'}))},
    reviewedEndpointSchema:'insufficient: no producer handler-consumed epoch; no exterior controller oracle; not fabricated',
    unresolved:['Exterior damping and auto-rotation expected pose','Moving PNG 04/05 to native-state attribution','No-op/clamped handler consumption without independently changed state','Intermediate seat presentation','Old frame-count and stable-resize failures','Compositor frame identity; between-sample flicker; physical-device responsiveness'],fullMotionVerdict:'not-established',perceptualSmoothness:'not-established',hardwareFps:'not-established'};
}

export function assessObservedEffectRun(value){try{return assessObservedEffectRunChecked(value);}catch(error){return{contract:'r35-causal-observed-effect-v1',result:'insufficient',failures:[`Malformed causal artifact: ${error.message}`],fullMotionVerdict:'not-established',perceptualSmoothness:'not-established',hardwareFps:'not-established'};}}
