import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installHomeRepairAudioObserver} from '../scripts/home-repair-audio-observer.mjs';
import {assessAudio} from '../scripts/home-repair-policy.mjs';
function fixture(){
  const calls=[],listeners=new Map(),microtasks=[];let time=0;
  class AudioNode {constructor(context){this.context=context;}connect(to){calls.push({kind:'connect',from:this,to});return to;}disconnect(...args){calls.push({kind:'disconnect',from:this,args});}}
  class AudioBufferSourceNode extends AudioNode {constructor(context){super(context);this.listeners=new Map();this.buffer={duration:7.60056689342404};this.loop=false;}addEventListener(name,fn){this.listeners.set(name,fn);}end(){this.listeners.get('ended')?.();}start(...args){calls.push({kind:'start',from:this,args});}stop(...args){calls.push({kind:'stop',from:this,args});}}
  class Analyser extends AudioNode {fftSize=256;getFloatTimeDomainData(values){values.fill(this.context.signal);}}
  class AudioContext {constructor(){this.destination=new AudioNode(this);this.currentTime=0;this.state='suspended';this.signal=0;}createBufferSource(){return new AudioBufferSourceNode(this);}createGain(){return new AudioNode(this);}createAnalyser(){calls.push({kind:'createAnalyser'});return new Analyser(this);}resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
  const sandbox={AudioContext,AudioNode,AudioBufferSourceNode,performance:{now:()=>time},navigator:{userActivation:{isActive:true}},document:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},queueMicrotask:fn=>microtasks.push(fn),Float32Array,WeakMap,Map,Object,Reflect,Array,Number,String,Math,Boolean,Error,Promise};
  vm.createContext(sandbox);vm.runInContext(`(${installHomeRepairAudioObserver.toString()})()`,sandbox);
  const context=new AudioContext(),source=context.createBufferSource(),gain=context.createGain();
  const click=trusted=>{sandbox.event={type:'click',isTrusted:trusted,target:{closest:()=>({textContent:'Hear the R35'})}};listeners.get('click')(sandbox.event);};
  const snapshot=()=>JSON.parse(JSON.stringify(sandbox.__r35HomeAudio.snapshot()));
  return {context,source,gain,calls,listeners,microtasks,click,snapshot,api:sandbox.__r35HomeAudio,advance:()=>{time+=100;context.currentTime+=.1;},sandbox};
}
test('observer never starts or resumes audio and preserves native source-gain-destination output',()=>{
 const f=fixture();assert.equal(f.calls.some(call=>['start','resume'].includes(call.kind)),false);const before=f.snapshot();f.click(true);f.context.resume();f.source.connect(f.gain);assert.equal(f.gain.connect(f.context.destination),f.context.destination);f.source.start(0,0,f.source.buffer.duration);
 assert.ok(f.calls.some(call=>call.kind==='connect'&&call.from===f.source&&call.to===f.gain));assert.ok(f.calls.some(call=>call.kind==='connect'&&call.from===f.gain&&call.to===f.context.destination));assert.equal(f.calls.filter(call=>call.kind==='createAnalyser').length,1);
 f.advance();f.context.signal=.02;const after=f.snapshot();assert.equal(assessAudio(before,after).passed,true);assert.equal(after.samples.at(-1).peak,Math.fround(.02));assert.equal(after.samples.at(-1).gainNodeId,after.nodes.find(node=>node.kind==='gain').id);
});
test('zero actual post-gain samples cannot pass even with nonzero source data, trust and clock',()=>{
 const f=fixture();const before=f.snapshot();f.click(true);f.context.resume();f.source.connect(f.gain);f.gain.connect(f.context.destination);f.source.start();f.source.buffer.samples=[1,1,1];f.advance();const after=f.snapshot();assert.equal(assessAudio(before,after).nonzeroPostGain,false);assert.equal(assessAudio(before,after).passed,false);
});
test('untrusted gesture, absent prior clock, unrelated graph or disconnected destination cannot certify audio',()=>{
 const f=fixture();const before=f.snapshot();f.click(false);f.context.resume();f.source.connect(f.gain);f.gain.connect(f.context.destination);f.source.start();f.advance();f.context.signal=.02;const untrusted=f.snapshot();assert.equal(assessAudio(before,untrusted).trustedGesture,false);
 f.click(true);f.context.resume();assert.equal(assessAudio(before,f.snapshot()).passed,false,'A later trusted resume cannot retroactively certify an earlier source start');f.source.start();f.advance();const trusted=f.snapshot();assert.equal(assessAudio(before,trusted).passed,true);assert.equal(assessAudio({...before,contexts:[]},trusted).clockAdvanced,false);
 const stale=structuredClone(trusted);stale.samples.forEach(sample=>sample.sequence=0);assert.equal(assessAudio(before,stale).nonzeroPostGain,false);
 const unrelated=structuredClone(trusted);unrelated.samples.forEach(sample=>sample.gainNodeId=999);assert.equal(assessAudio(before,unrelated).nonzeroPostGain,false);
 f.source.stop();f.source.disconnect();f.gain.disconnect();assert.equal(assessAudio(before,f.snapshot()).sourceGainDestination,false);
});
test('mute/stop/close native calls remain recorded and observer cleanup restores all owned hooks',()=>{
 const f=fixture();f.click(true);f.context.resume();f.source.connect(f.gain);f.gain.connect(f.context.destination);f.source.start();f.source.stop();f.source.disconnect();f.gain.disconnect();f.context.close();const final=f.snapshot();assert.ok(final.events.some(event=>event.kind==='stop'));assert.ok(final.events.some(event=>event.kind==='close'));assert.equal(final.edges.some(edge=>edge.active),false);assert.equal(final.contexts[0].state,'closed');
 f.api.stop();assert.equal(f.listeners.size,0);const eventCount=f.snapshot().events.length;f.context.resume();assert.equal(f.snapshot().events.length,eventCount);f.api.stop();
});
test('resume outside the exact native event cannot borrow a prior trusted gesture',()=>{
 const f=fixture();f.click(true);f.sandbox.event=undefined;f.context.resume();assert.equal(f.snapshot().events.find(event=>event.kind==='resume').trustedGesture,false);
});

test('scheduled native stop is not confused with actual native ended',()=>{
 const f=fixture();f.source.start(0,0,7.60056689342404);f.source.stop(.08);assert.equal(f.snapshot().events.some(event=>event.kind==='ended'),false);f.advance();f.source.end();const state=f.snapshot();const stop=state.events.find(event=>event.kind==='stop'),ended=state.events.find(event=>event.kind==='ended');assert.ok(ended.sequence>stop.sequence);assert.ok(ended.contextTime>stop.contextTime);assert.deepEqual(stop.stopArguments,[.08]);
});

test('provider iframe global is left completely untouched',()=>{const sandbox={top:{}};vm.createContext(sandbox);vm.runInContext(`(${installHomeRepairAudioObserver.toString()})()`,sandbox);assert.equal(sandbox.__r35HomeAudio,undefined);});
