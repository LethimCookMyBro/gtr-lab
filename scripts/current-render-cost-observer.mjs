/** Passive bounded bookkeeping. Adds zero GL calls, syncs, timers, RAFs or invalidations.
 * Existing native calls retain receiver, arguments, result and thrown object.
 * Groups are observed framebuffer/viewport draw groups, NOT semantic render passes.
 * Time is CPU-visible call/observation wall time, NOT GPU execution time. */
export function installCurrentRenderCostObserver({maxRecords=65536}={}) {
 if(globalThis.__r35CurrentRenderCost)throw new Error('Duplicate render-cost observer');
 if(typeof globalThis.__gtrFunctionalCaptureObserver!=='function')throw new Error('Existing functional observer required');
 if(!Number.isSafeInteger(maxRecords)||maxRecords<4||maxRecords>65536)throw new Error('Invalid bounded observation size');
 const original=globalThis.__gtrFunctionalCaptureObserver,contexts=new WeakMap(),owners=new Map(),framebuffers=new WeakMap();
 const events=[],passes=[],issues=[];let sequence=0,nextFramebuffer=0,dropped=0,phase='setup';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const issue=message=>{if(issues.length<32&&!issues.includes(message))issues.push(message);};
 const safe=fn=>{try{return fn();}catch(e){issue(`Observation bookkeeping: ${String(e)}`);}};
 const append=(list,row)=>{if(list.length>=maxRecords){dropped++;issue('Observation capacity exhausted');return false;}list.push(row);return true;};
 const stamp=()=>({at:performance.now(),sequence:++sequence,phase});
 const close=()=>owners.forEach(owner=>{owner.group=null;});
 const idFor=framebuffer=>{if(framebuffer===null)return null;if(!framebuffers.has(framebuffer))framebuffers.set(framebuffer,++nextFramebuffer);return framebuffers.get(framebuffer);};
 globalThis.__gtrFunctionalCaptureObserver=function(event){
  // Preserve the functional certificate consumer independently of this observer.
  const result=Reflect.apply(original,this,[event]);
  safe(()=>{
   if(event.kind==='attach'){
    const owner={id:event.owner,canvas:event.canvas,context:event.context,framebuffer:null,viewport:null,group:null};
    contexts.set(event.context,owner);owners.set(event.owner,owner);append(events,{kind:'attach',owner:event.owner,...stamp()});
   }else{
    append(events,{...clone(event),...stamp()});
    if(['main','fence','buffer-replaced'].includes(event.kind))close();
    if(event.kind==='stop'){const owner=owners.get(event.owner);if(owner)contexts.delete(owner.context);owners.delete(event.owner);}
   }
  });return result;
 };
 const drawMethods=['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'];
 for(const name of ['bindFramebuffer','viewport','clear',...drawMethods]){
  const proto=globalThis.WebGL2RenderingContext?.prototype,descriptor=proto&&Object.getOwnPropertyDescriptor(proto,name);
  if(typeof descriptor?.value!=='function'){issue(`Required WebGL2 method missing: ${name}`);continue;}
  const native=descriptor.value;
  Object.defineProperty(proto,name,{...descriptor,value:function(...args){
   const owner=contexts.get(this);if(!owner)return Reflect.apply(native,this,args);
   const start=performance.now();let result;
   try{result=Reflect.apply(native,this,args);}catch(error){safe(()=>issue(`Native ${name} threw: ${String(error)}`));throw error;}
   const end=performance.now();
   safe(()=>{
    if(name==='bindFramebuffer'&&(args[0]===this.FRAMEBUFFER||args[0]===this.DRAW_FRAMEBUFFER)){const next=idFor(args[1]);if(next!==owner.framebuffer)owner.group=null;owner.framebuffer=next;}
    else if(name==='viewport'){const value=args.slice(0,4);if(JSON.stringify(value)!==JSON.stringify(owner.viewport))owner.group=null;owner.viewport=value;}
    else if(drawMethods.includes(name)){
     if(!owner.group){const group={owner:owner.id,framebuffer:owner.framebuffer,viewport:owner.viewport?[...owner.viewport]:null,buffer:{width:this.drawingBufferWidth,height:this.drawingBufferHeight},firstCallStartedAt:start,lastCallEndedAt:end,draws:0,triangles:0,drawNativeCallMs:0,methods:{},...stamp()};if(!append(passes,group))return;owner.group=group;}
     const group=owner.group,count=name.startsWith('drawElements')?args[1]:args[2],instances=name.endsWith('Instanced')?args.at(-1):1;
     const triangles=args[0]===this.TRIANGLES?Math.floor(count/3):[this.TRIANGLE_STRIP,this.TRIANGLE_FAN].includes(args[0])?Math.max(0,count-2):0;
     group.draws++;group.triangles+=triangles*instances;group.drawNativeCallMs+=end-start;group.lastCallEndedAt=end;group.methods[name]=(group.methods[name]??0)+1;
    }
   });return result;
  }});
 }
 for(const type of ['click','change','keydown','keyup','pointerdown','pointerup','wheel'])document.addEventListener(type,event=>safe(()=>{
  close();const owner=[...owners.values()].find(x=>x.canvas===event.target);
  append(events,{kind:'input',type,trusted:event.isTrusted===true,owner:owner?.id??null,key:event.key??null,repeat:event.repeat??false,shift:event.shiftKey??false,target:{tag:event.target?.tagName??null,value:event.target?.value??null,name:event.target?.name??null,text:(event.target?.textContent??'').trim().slice(0,160)},...stamp()});
 }),true);
 globalThis.__r35CurrentRenderCost=Object.freeze({
  mark(name,data={}){close();phase=String(name);const row={kind:'mark',data:clone(data),...stamp()};append(events,row);return clone(row);},
  snapshot(){return clone({version:1,phase,sequence,events,passes,issues,dropped});},
 });
}
