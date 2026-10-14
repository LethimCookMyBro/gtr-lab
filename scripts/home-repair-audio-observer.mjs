/** CI-only native Web Audio observation. Never starts, resumes, mutes or stops app audio.
 * A native analyser branch taps each app gain already connected to destination;
 * the original source -> gain -> destination connection is retained unchanged.
 * Samples are actual post-gain graph output, never source-buffer contents.
 * Chromium window.event must still be the exact captured trusted pointer/key/click when
 * native resume is called; a later microtask/user-activation token alone cannot pass. */
export function installHomeRepairAudioObserver() {
  if (globalThis.top && globalThis.top !== globalThis) return; // Leave provider frames completely untouched.
  if(globalThis.__r35HomeAudio)throw new Error('Audio observer already installed');
  const contexts=[],nodes=[],events=[],edges=[],samples=[],issues=[],restorers=[],ids=new WeakMap(),taps=new Map();
  let lastGesture=null,stopped=false,sequence=0;
  const append=(list,row)=>{if(list.length<2048)list.push({...row,sequence:++sequence});else if(!issues.includes('Audio observer capacity exceeded'))issues.push('Audio observer capacity exceeded');};
  const now=()=>performance.now();
  const safe=fn=>{try{return fn();}catch(error){if(issues.length<32)issues.push(String(error));}};
  const id=(object,kind)=>{if(!ids.has(object)){const record={id:nodes.length+1,kind,object};nodes.push(record);ids.set(object,record);}return ids.get(object);};
  const contextFor=context=>{let row=contexts.find(row=>row.object===context);if(!row){row={id:contexts.length+1,object:context};contexts.push(row);id(context.destination,'destination');}return row;};
  const record=(kind,self,extra={})=>{const context=self.context??self;append(events,{kind,at:now(),contextId:contextFor(context).id,nodeId:ids.get(self)?.id??null,contextTime:context.currentTime,state:context.state,trustedGesture:!!lastGesture&&globalThis.event===lastGesture&&lastGesture.isTrusted===true,userActivation:navigator.userActivation?.isActive===true,...extra});};
  const click=event=>{lastGesture=event;append(events,{kind:'gesture',at:now(),trusted:event.isTrusted===true,label:(event.target?.closest?.('button')?.textContent??'').trim().slice(0,100)});};
  for(const type of ['pointerdown','pointerup','keydown','click'])document.addEventListener(type,click,true);
  const patch=(prototype,name,observe)=>{
    let owner=prototype;while(owner&&!Object.hasOwn(owner,name))owner=Object.getPrototypeOf(owner);
    const descriptor=owner&&Object.getOwnPropertyDescriptor(owner,name);if(typeof descriptor?.value!=='function'){issues.push(`Missing native audio method: ${name}`);return null;}
    const native=descriptor.value;const wrapped=function(...args){const result=Reflect.apply(native,this,args);safe(()=>observe(this,args,result));return result;};
    Object.defineProperty(owner,name,{...descriptor,value:wrapped});restorers.push(()=>{if(Object.getOwnPropertyDescriptor(owner,name)?.value===wrapped)Object.defineProperty(owner,name,descriptor);else issues.push(`Audio hook ownership changed: ${name}`);});return native;
  };
  const Audio=globalThis.AudioContext;
  if(!Audio||!globalThis.AudioNode||!globalThis.AudioBufferSourceNode){issues.push('Native Web Audio unavailable');}
  else {
    patch(Audio.prototype,'createBufferSource',(context,_args,node)=>{contextFor(context);id(node,'source');node.addEventListener?.('ended',()=>{if(!stopped)safe(()=>record('ended',node));},{once:true});});
    patch(Audio.prototype,'createGain',(context,_args,node)=>{contextFor(context);id(node,'gain');});
    patch(Audio.prototype,'resume',(context)=>record('resume',context));
    patch(Audio.prototype,'close',(context)=>{record('close',context);for(const [gain,tap] of taps)if(gain.context===context){safe(()=>tap.analyser.disconnect());taps.delete(gain);}});
    let nativeConnect;
    nativeConnect=patch(AudioNode.prototype,'connect',(from,[to])=>{
      if(!to||!ids.has(from))return;
      const left=ids.get(from),right=ids.get(to)??id(to,to===from.context.destination?'destination':'other');
      const edge={from:left.id,to:right.id,fromKind:left.kind,toKind:right.kind,active:true};append(edges,edge);
      if(left.kind==='gain'&&right.kind==='destination'&&!taps.has(from)){
        const analyser=from.context.createAnalyser();analyser.fftSize=256;
        Reflect.apply(nativeConnect,from,[analyser]);taps.set(from,{analyser,edge});
      }
    });
    patch(AudioNode.prototype,'disconnect',(from,args)=>{
      const left=ids.get(from);if(left)for(const edge of edges)if(edge.from===left.id&&(args.length===0||ids.get(args[0])?.id===edge.to))edge.active=false;
      if(taps.has(from)){const tap=taps.get(from);safe(()=>tap.analyser.disconnect());taps.delete(from);}
      if(left)record('disconnect',from);
    });
    patch(AudioBufferSourceNode.prototype,'start',(source,args)=>record('start',source,{bufferDuration:source.buffer?.duration??null,loop:source.loop,startArguments:args}));
    patch(AudioBufferSourceNode.prototype,'stop',(source,args)=>record('stop',source,{stopArguments:args}));
  }
  globalThis.__r35HomeAudio=Object.freeze({
    snapshot(){
      if(!stopped)for(const [gain,tap] of taps){const values=new Float32Array(tap.analyser.fftSize);safe(()=>{tap.analyser.getFloatTimeDomainData(values);let peak=0,sum=0;for(const value of values){peak=Math.max(peak,Math.abs(value));sum+=value*value;}append(samples,{at:now(),contextId:contextFor(gain.context).id,contextTime:gain.context.currentTime,gainNodeId:ids.get(gain).id,connectedToDestination:tap.edge.active,peak,rms:Math.sqrt(sum/values.length)});});}
      return {contexts:contexts.map(row=>({id:row.id,currentTime:row.object.currentTime,state:row.object.state})),nodes:nodes.map(({id,kind})=>({id,kind})),events:events.map(row=>({...row})),edges:edges.map(row=>({...row})),samples:samples.map(row=>({...row})),issues:[...issues],stopped,observation:'Native post-gain analyser branch; original destination routing preserved. No speaker-output certification.'};
    },
    stop(){if(stopped)return;stopped=true;for(const type of ['pointerdown','pointerup','keydown','click'])document.removeEventListener(type,click,true);for(const [gain,tap] of taps){safe(()=>gain.disconnect(tap.analyser));safe(()=>tap.analyser.disconnect());}taps.clear();for(const restore of restorers.reverse())safe(restore);},
  });
}
