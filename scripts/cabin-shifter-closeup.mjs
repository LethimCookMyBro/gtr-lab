/** Desktop-only diagnostic framing through the existing trusted interior controls. */
import assert from 'node:assert/strict';
import {createCabinOracle} from './causal-cabin-model.mjs';
import {assertNativeCertificate} from './cabin-leather-comparison-policy.mjs';
export const closeupInputs = Object.freeze([
 ...Array.from({length:8},()=>Object.freeze({type:'keydown',key:'ArrowRight'})),
 ...Array.from({length:8},()=>Object.freeze({type:'keydown',key:'ArrowDown'})),
 Object.freeze({type:'wheel',deltaY:-1080}),
]);
export const selectorBounds = Object.freeze([
 Object.freeze([-.08294346928596497,.45904800295829773,-.12800000607967377]),
 Object.freeze([.08294333517551422,.5891454219818115,.10999999940395355]),
]);
export function closeupOracle(transform) { const oracle=createCabinOracle(transform);oracle.reset('driver');for(const input of closeupInputs)oracle.input(input);return oracle; }
export function selectorFraming(snapshot,transform) {
 const pose=snapshot.pose,q=pose.quaternion.map((v,i)=>i===3?v:-v),m=pose.projection;
 const rotate=v=>{const [x,y,z]=v,[qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);return[x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];};
 const points=[];
 for(let i=0;i<8;i++) {const p=[0,1,2].map(axis=>selectorBounds[(i>>axis)&1][axis]*transform.scale+transform.position[axis]-pose.position[axis]);const [x,y,z]=rotate(p),w=-z;assert.ok(w>0,'Full selector bounds must be ahead of the fixed eye');points.push([(m[0]*x+m[8]*z)/w,(m[5]*y+m[9]*z)/w]);}
 const bounds={left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),bottom:Math.min(...points.map(p=>p[1])),top:Math.max(...points.map(p=>p[1]))};
 for(const value of Object.values(bounds))assert.ok(Number.isFinite(value)&&Math.abs(value)<.8,'Complete selector and cap/bevel boundary need a 10% frame margin');
 assert.ok(bounds.right-bounds.left>.15&&bounds.top-bounds.bottom>.3,'Selector must occupy a useful diagnostic footprint');
 return {nativeBounds:selectorBounds,ndcBounds:bounds,scope:'Projected complete selector surround AABB, including cap/bevel boundary. Actual occlusion, highlights and framing remain image-review gates.'};
}
export function installShifterInputObserver() {
 let active=false,events=[];const copy=x=>JSON.parse(JSON.stringify(x));
 const observe=event=>{if(!active||!['keydown','wheel'].includes(event.type))return;events.push({type:event.type,...(event.type==='keydown'?{key:event.key}:{deltaY:event.deltaY}),trusted:event.isTrusted,canvas:event.target===document.querySelector('.scene-stage canvas'),at:performance.now()});};
 document.addEventListener('keydown',observe,true);document.addEventListener('wheel',observe,true);
 Object.defineProperty(globalThis,'__r35ShifterInputs',{value:Object.freeze({start(){events=[];active=true;},stop(){active=false;return copy(events);}}),configurable:false});
}
export function assertCloseupCapture(capture,observation,target,transform) {
 assert.equal(target.name,'desktop');assert.equal(capture.label,'shifter-top');assert.equal(capture.seat,'driver');
 assertNativeCertificate(capture.certificate,observation,target,'driver');
 const c=capture.certificate,d=c.snapshot.dimensions;
 assert.ok(closeupOracle(transform).compare(c.snapshot,d.renderWidth,d.renderHeight),'Fixed input sequence must match independent exact settled pose/projection');
 assert.deepEqual(capture.inputs.map(({type,key,deltaY})=>type==='keydown'?{type,key}:{type,deltaY}),closeupInputs);
 const main=observation.events.find(e=>e.kind==='main'&&e.owner===c.owner&&e.id===c.mainDrawId);
 let previous=c.armedAt;for(const input of capture.inputs){assert.equal(input.trusted,true);assert.equal(input.canvas,true);assert.ok(input.at>=previous&&input.at<main.at&&input.at<=c.readyAt,'Every fixed input must precede the completed native main frame');previous=input.at;}
 assert.deepEqual(capture.framing,selectorFraming(c.snapshot,transform));return true;
}
