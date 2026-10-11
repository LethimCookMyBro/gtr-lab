import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installGpuFrameObserver } from '../scripts/gpu-frame-observer.mjs';
function fixture(options={}) {
  let time=0, next=0; const timers=new Map(), rafs=[], calls=[], deleted=[], canvasEvents=new Map();
  class Canvas { constructor(){this.width=1967;this.height=1016;this.isConnected=true;} matches(s){return s==='.scene-stage canvas';} getContext(name){return name==='webgl2'?gl:null;} addEventListener(n,f){canvasEvents.set(n,f);} removeEventListener(n,f){if(canvasEvents.get(n)===f)canvasEvents.delete(n);} }
  class GL { constructor(){this.canvas=new Canvas();this.drawingBufferWidth=1967;this.drawingBufferHeight=1016;this.SYNC_GPU_COMMANDS_COMPLETE=37143;this.ALREADY_SIGNALED=37146;this.CONDITION_SATISFIED=37148;this.TIMEOUT_EXPIRED=37147;this.WAIT_FAILED=37149;}
    drawElements(...args){calls.push(['draw',...args]);return 77;}
    drawArrays(...args){calls.push(['drawArrays',...args]);}
    drawElementsInstanced(...args){calls.push(['drawElementsInstanced',...args]);}
    drawArraysInstanced(...args){calls.push(['drawArraysInstanced',...args]);}
    drawRangeElements(...args){calls.push(['drawRangeElements',...args]);}
    clear(){calls.push(['clear']);}
    drawBuffers(){calls.push(['drawBuffers']);}
    bufferData(){calls.push(['bufferData']);}
    getParameter(){return 'fake';}
    getExtension(){return null;}
    fenceSync(condition,flags){calls.push(['fence',condition,flags]);const s={id:++next,status:this.TIMEOUT_EXPIRED};this.syncs.push(s);return options.nullFence?null:s;}
    clientWaitSync(s,flags,timeout){calls.push(['wait',s.id,flags,timeout]);time+=options.waitOverheadMs??0;return s.status;}
    deleteSync(s){deleted.push(s.id);}
    isContextLost(){return Boolean(this.lost);}
  }
  const gl=new GL();gl.syncs=[];
  const sandbox={HTMLCanvasElement:Canvas,WebGL2RenderingContext:GL,performance:{now:()=>time},WeakMap,WeakRef,Map,Set,Object,Reflect,Array,Number,String,Math,Boolean,Error,
    requestAnimationFrame(cb){rafs.push(cb);return rafs.length;},cancelAnimationFrame(){},setTimeout(cb,ms){const id=++next;timers.set(id,{cb,due:time+ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(sandbox);vm.runInContext(`(${installGpuFrameObserver.toString()})(${JSON.stringify(options)})`,sandbox);
  const api=sandbox.__r35GpuFrames;
  gl.canvas.getContext('webgl2');
  const frame=(fn=()=>gl.drawElements(4,300,5123,0),at=time)=>{time=at;sandbox.requestAnimationFrame(fn);rafs.shift()(at);};
  const tick=(at)=>{time=at;for(const [id,t]of [...timers])if(t.due<=time){timers.delete(id);t.cb();}};
  return {api,gl,calls,deleted,timers,canvasEvents,frame,tick,setTime:v=>time=v,snapshot:()=>JSON.parse(JSON.stringify(api.snapshot())),sandbox};
}
test('inserts one fence after actual app draws, never on an empty RAF; preserves callback result and native receiver',()=>{
 const f=fixture();assert(f.api,'observer API must exist');f.frame(()=>{});assert.equal(f.gl.syncs.length,0);f.frame(()=>assert.equal(f.gl.drawElements(4,300,5123,0),77),10);assert.deepEqual(f.calls.slice(-2),[['draw',4,300,5123,0],['fence',37143,0]]);const s=f.snapshot();assert.equal(s.frames.length,1);assert.equal(s.frames[0].calls,1);assert.equal(s.frames[0].triangles,100);assert.equal(s.frames[0].callbackReturned,true);assert.equal(s.frames[0].status,'pending');assert.equal(s.frames[0].entryPriorAppWorkComplete,false);assert(!f.calls.some(c=>c[0]==='wait'));
});
test('polling yields tasks, uses only zero wait and no flush; completion keeps observable lower/upper brackets',()=>{
 const f=fixture();f.frame(undefined,10);f.tick(60);f.gl.syncs[0].status=f.gl.CONDITION_SATISFIED;f.tick(110);const r=f.snapshot().frames[0];assert.equal(r.status,'signaled');assert.equal(r.lastUnsignaledAt,60);assert.equal(r.observedSignaledAt,110);assert.equal(r.observableLatencyLowerMs,50);assert.equal(r.observableLatencyUpperMs,100);assert.deepEqual(f.calls.filter(c=>c[0]==='wait').map(c=>c.slice(2)),[[0,0],[0,0]]);assert.equal(f.deleted.length,1);assert.equal(f.timers.size,1); // only whole-observer deadline remains
});
test('new frame records predecessor count and distinguishes drained app work from a pending predecessor',()=>{
 const f=fixture();f.frame(undefined,10);f.frame(undefined,30);assert.equal(f.snapshot().frames[1].entryPendingEarlierFrames,1);assert.equal(f.snapshot().frames[1].entryPriorAppWorkComplete,false);f.gl.syncs.forEach(s=>s.status=f.gl.ALREADY_SIGNALED);f.tick(80);f.frame(undefined,90);const r=f.snapshot().frames[2];assert.equal(r.entryPendingEarlierFrames,0);assert.equal(r.entryPriorAppWorkComplete,true);assert.equal(r.previousCompletedFrameId,2);assert.equal(r.entryIdleSincePreviousFenceMs,60);
});
test('outside-RAF GL mutations invalidate isolated-entry eligibility until a new completed fence covers them',()=>{
 const f=fixture();f.frame(undefined,10);f.gl.syncs[0].status=f.gl.ALREADY_SIGNALED;f.tick(60);f.gl.bufferData();f.frame(undefined,70);assert.equal(f.snapshot().frames[1].entryPriorAppWorkComplete,false);assert.equal(f.snapshot().frames[1].outsideWorkSincePreviousFence,1);f.gl.syncs[1].status=f.gl.ALREADY_SIGNALED;f.tick(120);f.frame(undefined,130);assert.equal(f.snapshot().frames[2].entryPriorAppWorkComplete,true);
});
test('same-timestamp callbacks remain separate and callback throws are preserved with a partial boundary',()=>{
 const f=fixture();f.frame(undefined,10);f.frame(undefined,10);assert.equal(f.snapshot().frames.length,2);const error=new Error('application failure');assert.throws(()=>f.frame(()=>{f.gl.drawArrays(4,0,9);throw error;},20),e=>e===error);const r=f.snapshot().frames[2];assert.equal(r.callbackReturned,false);assert.equal(r.status,'pending');assert(f.snapshot().issues.some(x=>x.includes('callback threw')));
});
test('pending capacity and total-frame capacity stop observation without suppressing application draws',()=>{
 for(const options of [{maxPending:2},{maxFrames:2}]){const f=fixture(options);f.frame(undefined,1);f.frame(undefined,2);f.frame(undefined,3);const s=f.snapshot();assert.equal(s.stopped,true);assert.equal(s.frames.length,2);assert.equal(f.deleted.length,2);assert.equal(f.calls.filter(c=>c[0]==='draw').length,3);assert.equal(f.timers.size,0);f.frame(undefined,4);assert.equal(f.gl.syncs.length,2);}
});
test('timer delay and polling overhead are explicit rather than hidden as GPU execution time',()=>{
 const f=fixture({waitOverheadMs:3});f.frame(undefined,10);f.tick(500);const p=f.snapshot().polls[0];assert.equal(p.scheduledFor,60);assert.equal(p.startedAt,500);assert.equal(p.schedulingDelayMs,440);assert.equal(p.elapsedMs,3);assert.equal(f.snapshot().frames[0].lastUnsignaledAt,503);
});
test('deadline and manual stop delete unresolved syncs, cancel timers, restore methods, and are idempotent',()=>{
 for(const automatic of [false,true]){const f=fixture({windowMs:200});f.frame(undefined,10);if(automatic)f.tick(201);else f.api.stop('test-end');const s=f.snapshot();assert.equal(s.stopped,true);assert.equal(s.frames[0].status,'censored');assert.equal(f.deleted.length,1);assert.equal(f.timers.size,0);assert.equal(f.canvasEvents.size,0);f.api.stop('repeat');assert.equal(f.deleted.length,1);f.frame(undefined,220);assert.equal(f.gl.syncs.length,1);assert.equal(f.calls.filter(c=>c[0]==='draw').length,2);}
});
test('wait failure, null fence, context loss and unsupported draw extensions remain incomplete',()=>{
 const a=fixture();a.frame(undefined,1);a.gl.syncs[0].status=a.gl.WAIT_FAILED;a.tick(51);assert.equal(a.snapshot().stopped,true);assert(a.snapshot().issues.some(x=>x.includes('WAIT_FAILED')));
 const b=fixture({nullFence:true});b.frame(undefined,1);assert.equal(b.snapshot().stopped,true);assert(b.snapshot().issues.some(x=>x.includes('fenceSync')));
 const c=fixture();c.frame(undefined,1);c.canvasEvents.get('webglcontextlost')();assert.equal(c.snapshot().stopped,true);assert(c.snapshot().issues.some(x=>x.includes('context lost')));
});
test('snapshot does not expose native objects and mark is bounded to valid known phases',()=>{
 const f=fixture();f.api.mark('initial-idle');f.frame(undefined,1);assert.equal(f.snapshot().frames[0].phase,'initial-idle');assert.throws(()=>f.api.mark('arbitrary'));assert.doesNotThrow(()=>JSON.stringify(f.api.snapshot()));assert.equal(f.snapshot().contexts[0].requestedAttributes,null);
});

test('drawBuffers is state work, not a draw, and cannot create a fence by itself',()=>{
 const f=fixture();f.frame(()=>f.gl.drawBuffers(),1);assert.equal(f.gl.syncs.length,0);assert.equal(f.snapshot().frames.length,0);f.frame(()=>{f.gl.drawBuffers();f.gl.drawArrays(4,0,9);},2);assert.equal(f.snapshot().frames[0].calls,1);
});
test('native loss before delayed loss event invalidates cached success and final evidence',()=>{
 const f=fixture();f.frame(undefined,1);f.gl.lost=true;f.gl.syncs[0].status=f.gl.ALREADY_SIGNALED;f.tick(51);assert.equal(f.snapshot().frames[0].status,'censored');assert(f.snapshot().issues.some(s=>s.includes('context lost')));
 const g=fixture();g.frame(undefined,1);g.gl.syncs[0].status=g.gl.ALREADY_SIGNALED;g.tick(51);g.gl.lost=true;g.api.stop('scenario-ended');assert(g.snapshot().issues.some(s=>s.includes('context lost')));assert.equal(g.snapshot().contexts[0].nativeContextLost,true);
});
