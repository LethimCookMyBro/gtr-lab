import assert from 'node:assert/strict';
/** Driver-only coordinator. Every retry uses the same absolute gate deadline. */
export async function waitForCleanGate({name,budgetMs,keyIndex=null,now,readState,createCheckpoint,pause}) {
  assert.equal(budgetMs,keyIndex===null?45_000:30_000,'Fixed reviewed gate budget required');
  assert.equal(name,keyIndex===null?'initial':`key-${keyIndex}`);
  const row={name,keyIndex,budgetMs,startedAt:now(),status:'waiting',attempts:[],frameIds:[],snapshots:0};
  const deadline=row.startedAt+budgetMs;let currentId=null;
  const fail=message=>{row.status='failed';row.elapsedMs=now()-row.startedAt;const error=new Error(message);error.gate=row;throw error;};
  while(now()<deadline){
    const remaining=()=>Math.max(0,deadline-now());
    const o=await readState(remaining());row.snapshots++;
    if(o.stopped||o.issues.length)fail('Observer stopped or reported an issue');
    const scenes=o.contexts.filter(c=>c.sceneCanvas&&c.connected);
    if(scenes.length!==1||scenes[0].nativeContextLost||scenes[0].lostEvents||scenes[0].restoredEvents)fail('One healthy scene context required');
    const context=scenes[0];let inputFrames=[];
    if(keyIndex!==null){
      const key=o.keys.find(k=>k.index===keyIndex);
      if(!key||key.keydowns.length!==1||!key.keydowns[0].isTrusted||key.keydowns[0].repeat||!key.keydowns[0].focused)fail('Exactly one trusted focused native keydown required');
      if(!key.keydowns[0].cleanCheckpoint||(key.workBeforeKeydown??0)>0)fail('Native keydown entered a dirty checkpoint prefix; dependent sequence stopped');
      inputFrames=o.frames.filter(f=>f.keyIndex===keyIndex&&f.id>key.keydowns[0].lastFrameId);
      row.frameIds=inputFrames.map(f=>f.id);
      if(inputFrames.some(f=>!f.callbackReturned))fail('Input draw callback did not return normally');
    }
    if(now()>=deadline)break;
    const actualComplete=o.pendingObservedFrames===0&&o.frames.every(f=>f.status==='signaled');
    const minimumFrames=keyIndex===null||inputFrames.length>0;
    const current=o.checkpoints.find(c=>c.id===currentId);
    for(const cp of o.checkpoints){const index=row.attempts.findIndex(a=>a.id===cp.id);if(index>=0)row.attempts[index]={...cp};}
    if(current&&current.status==='signaled'&&!current.stale&&current.workRevision===context.workRevision&&actualComplete&&minimumFrames){
      row.status='clean';row.checkpointId=current.id;row.workRevision=current.workRevision;row.completedAt=now();row.elapsedMs=row.completedAt-row.startedAt;return row;
    }
    if(actualComplete&&minimumFrames&&(!current||current.stale)){
      if(row.attempts.length>=4)fail('No clean checkpoint within four attempts');
      const cp=await createCheckpoint(name,remaining());
      // A null result means an actual frame started between status and creation.
      // No checkpoint was issued and no deadline/attempt counter is reset.
      if(cp){row.attempts.push({...cp});currentId=cp.id;}
    }
    if(remaining()>0)await pause(Math.min(250,remaining()));
  }
  fail(`${name} did not obtain a clean checkpoint within ${budgetMs}ms`);
}
export function classifyKeys(o){
 return (o.keys??[]).map(key=>{
  const event=key.keydowns[0];const frames=(o.frames??[]).filter(f=>f.keyIndex===key.index&&f.id>(event?.lastFrameId??Infinity));
  const completed=frames.length>0&&frames.every(f=>f.status==='signaled'&&f.callbackReturned);
  const cleanNative=key.keydowns.length===1&&event.isTrusted&&!event.repeat&&event.focused&&event.cleanCheckpoint&&!(key.workBeforeKeydown??0);
  const clean=cleanNative&&key.firstPostKeyWork?.cleanCheckpoint&&frames[0]?.entryCleanCheckpoint;
  let classification=!completed?'incomplete-prefix':frames.length>1?'multi-frame-non-isolated':!cleanNative?'unclean-entry-non-isolated':key.outsideWorkAfterKeydown?'one-scene-raf-with-outside-work':!clean?'unclean-entry-non-isolated':'one-scene-raf-clean-entry-prefix';
  return {index:key.index,classification,checkpointId:key.checkpointId,keydown:event??null,actualDrawRafs:frames.length,frameIds:frames.map(f=>f.id),outsideWorkAfterKeydown:key.outsideWorkAfterKeydown,workBeforeKeydown:key.workBeforeKeydown??0,firstPostKeyWork:key.firstPostKeyWork,frames:frames.map(f=>({id:f.id,calls:f.calls,triangles:f.triangles,callbackStartedAt:f.callbackStartedAt,callbackEndedAt:f.callbackEndedAt,fenceCallStartedAt:f.fenceCallStartedAt,lastUnsignaledAt:f.lastUnsignaledAt,observedSignaledAt:f.observedSignaledAt,status:f.status,observableLatencyLowerMs:f.observableLatencyLowerMs,observableLatencyUpperMs:f.observableLatencyUpperMs})),interpretation:'Input-associated command prefix; even one clean-entry draw RAF is not pure GPU execution. Outside-RAF work, internal submission, global fence scope and observable sync caching are reported separately.'};
 });
}
