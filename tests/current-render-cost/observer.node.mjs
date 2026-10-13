import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {installCurrentRenderCostObserver} from '../../scripts/current-render-cost-observer.mjs';
function fixture(options={}){
 let time=0;const calls=[],listeners={},seam=[];let owner;
 class GL{constructor(){this.drawingBufferWidth=1920;this.drawingBufferHeight=924;this.FRAMEBUFFER=0x8d40;this.DRAW_FRAMEBUFFER=0x8ca9;this.TRIANGLES=4;this.TRIANGLE_STRIP=5;this.TRIANGLE_FAN=6;}bindFramebuffer(...a){calls.push(['bind',this,...a]);time+=2;return 'bind-result';}viewport(...a){calls.push(['viewport',this,...a]);time+=1;}drawElements(...a){calls.push(['draw',this,...a]);time+=3;if(options.throwDraw)throw options.throwDraw;return 71;}drawArrays(...a){calls.push(['arrays',this,...a]);time+=3;return 72;}drawElementsInstanced(...a){calls.push(['instanced',this,...a]);time+=3;}drawArraysInstanced(...a){calls.push(['arrays-instanced',this,...a]);time+=3;}clear(...a){calls.push(['clear',this,...a]);time+=1;}}
 const gl=new GL(),canvas={};const sandbox={WebGL2RenderingContext:GL,performance:{now:()=>time},document:{addEventListener:(k,f)=>listeners[k]=f},__gtrFunctionalCaptureObserver:e=>seam.push(e)};
 for(const n of ['requestAnimationFrame','setTimeout','setInterval','queueMicrotask'])sandbox[n]=()=>{throw Error('Observer requested '+n);};
 vm.runInNewContext(`(${installCurrentRenderCostObserver.toString()})(${JSON.stringify(options.config??{})})`,sandbox);
 const api=sandbox.__r35CurrentRenderCost;assert.ok(api,'Observer missing');
 return {api,gl,canvas,calls,seam,emit:e=>sandbox.__gtrFunctionalCaptureObserver(e),tick:n=>time+=n,input:e=>listeners[e.type](e),attach(){owner={kind:'attach',owner:1,context:gl,canvas,read:()=>{throw Error('Unexpected state read');},pending:()=>{throw Error('Unexpected pending read');}};sandbox.__gtrFunctionalCaptureObserver(owner);return owner;}};
}
const plain=value=>JSON.parse(JSON.stringify(value));
// Mutation: add GL commands/polls/timers, change arguments, receiver, return, thrown error or production seam delivery.
test('observer forwards existing calls once without adding GL work, waits, timers or state reads',()=>{
 const f=fixture();const attach=f.attach();assert.equal(f.calls.length,0);assert.equal(f.seam[0],attach);
 assert.equal(f.gl.bindFramebuffer(f.gl.FRAMEBUFFER,null),'bind-result');f.gl.viewport(0,0,1920,924);assert.equal(f.gl.drawElements(4,300,5123,0),71);
 assert.equal(f.calls.length,3);assert.equal(f.calls[2][1],f.gl);assert.deepEqual(f.calls[2].slice(2),[4,300,5123,0]);
 const before=f.calls.length;const s=f.api.snapshot();f.api.mark('arm',{id:'x'});f.api.snapshot();assert.equal(f.calls.length,before);
 assert.equal(s.passes.length,1);assert.equal(s.passes[0].draws,1);assert.equal(s.passes[0].triangles,100);assert.deepEqual(plain(s.passes[0].viewport),[0,0,1920,924]);assert.equal(s.passes[0].drawNativeCallMs,3);
});
test('native throws propagate as the same object and are not repaired or retried',()=>{const error=new Error('native');const f=fixture({throwDraw:error});f.attach();assert.throws(()=>f.gl.drawElements(4,3,1,0),e=>e===error);assert.equal(f.calls.length,1);assert.equal(f.api.snapshot().issues.length,1);});
test('offscreen viewport groups, instanced counts and native completion remain separate',()=>{
 const f=fixture();f.attach();f.api.mark('arm',{id:'camera'});f.input({type:'keydown',target:f.canvas,key:'Home',isTrusted:true});
 f.gl.bindFramebuffer(f.gl.FRAMEBUFFER,{});f.gl.viewport(0,0,1024,1024);f.gl.drawElementsInstanced(4,30,1,0,4);f.gl.bindFramebuffer(f.gl.FRAMEBUFFER,null);f.gl.viewport(0,0,1920,924);f.gl.drawArrays(4,0,12);
 f.emit({kind:'main',owner:1,id:1,stable:true,snapshot:{dimensions:{width:1920,height:924}}});f.emit({kind:'fence',owner:1,id:1,draws:[1],previous:null});f.tick(100);f.emit({kind:'wait',owner:1,id:1,status:0x911b});
 const s=f.api.snapshot();assert.equal(s.passes.length,2);assert.equal(s.passes[0].triangles,40);assert.equal(s.passes[1].triangles,4);assert.equal(s.events.find(e=>e.kind==='fence').previous,null);assert.equal(s.events.find(e=>e.kind==='wait').status,0x911b);assert.equal(s.events.some(e=>e.kind==='completion'),false);assert.equal(s.events.find(e=>e.kind==='input').trusted,true);
});
test('observation capacity exhaustion fails closed and preserves earlier censored work',()=>{
 const f=fixture({config:{maxRecords:4}});f.attach();for(let i=0;i<8;i++)f.emit({kind:'wait',owner:1,id:1,status:0x911b});const s=f.api.snapshot();assert.ok(s.issues.some(x=>/capacity/.test(x)));assert.equal(s.events.length,4);assert.ok(s.dropped>0);
});
test('unattached contexts forward untouched and snapshots are detached',()=>{const f=fixture();f.gl.drawArrays(4,0,3);assert.equal(f.api.snapshot().passes.length,0);f.attach();f.gl.drawArrays(4,0,3);const s=f.api.snapshot();s.passes[0].draws=99;assert.equal(f.api.snapshot().passes[0].draws,1);});
