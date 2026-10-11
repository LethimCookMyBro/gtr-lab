/** Independent mathematical controller oracle. No production code or observed pose input. */
export function createCabinOracle(transform) {
  const views = {
    driver: { position: [.42, 1.18, -.235], target: [.15, .84, .39], fov: 72 },
    passenger: { position: [-.42, 1.18, -.235], target: [-.2, .9, .4], fov: 72 },
    rear: { position: [.4, 1.12, -.91], target: [.25, .93, .3], fov: 78 },
  };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const unit = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const world = p => p.map((x, i) => x * transform.scale + transform.position[i]);
  let state = null, pointer = null;
  const reset = seat => {
    if (!Object.hasOwn(views, seat)) throw new Error('Unknown independent seat');
    const view = views[seat], eye = world(view.position), target = world(view.target);
    const d = unit(target.map((v, i) => v-eye[i]));
    const yaw = Math.atan2(d[0], d[2]), pitch = Math.asin(d[1]);
    state = { seat, eye, target, fov: view.fov, yaw, pitch, yawMin: yaw-Math.PI, yawMax: yaw+Math.PI,
      pitchMin: Math.max(-Math.PI*89/180, pitch-Math.PI*70/180), pitchMax: Math.min(Math.PI*89/180, pitch+Math.PI*70/180) };
    pointer = null;
  };
  const input = event => {
    if (!state) return { applied: false, reason: 'exterior-oracle-unresolved' };
    const s=state;
    if (event.type === 'pointerdown') { if (pointer) return {applied:false,reason:'other-pointer'}; pointer={id:event.pointerId,x:event.clientX,y:event.clientY}; }
    else if(event.type==='pointermove') {
      if(!pointer || pointer.id!==event.pointerId) return {applied:false,reason:'hover-or-other-pointer'};
      s.yaw=clamp(s.yaw-(event.clientX-pointer.x)*.004,s.yawMin,s.yawMax);
      s.pitch=clamp(s.pitch+(event.clientY-pointer.y)*.003,s.pitchMin,s.pitchMax);
      pointer.x=event.clientX;pointer.y=event.clientY;
    } else if(event.type==='pointerup'||event.type==='pointercancel') { if(pointer?.id===event.pointerId)pointer=null;return {applied:false,reason:'release'}; }
    else if(event.type==='keydown') {
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return {applied:false,reason:'other-key'};
      s.yaw=clamp(s.yaw+(event.key==='ArrowLeft'?.08:event.key==='ArrowRight'?-.08:0),s.yawMin,s.yawMax);
      s.pitch=clamp(s.pitch+(event.key==='ArrowUp'?.06:event.key==='ArrowDown'?-.06:0),s.pitchMin,s.pitchMax);
    } else if(event.type==='wheel')s.fov=clamp(s.fov+event.deltaY*.025,45,85);
    else return {applied:false,reason:'not-controller-input'};
    return {applied:true};
  };
  const pose = (width,height) => {
    if(!state)return null;
    const s=state, direction=[Math.sin(s.yaw)*Math.cos(s.pitch),Math.sin(s.pitch),Math.cos(s.yaw)*Math.cos(s.pitch)];
    const z=direction.map(x=>-x), x=unit(cross([0,1,0],z)), y=cross(z,x);
    const m11=x[0],m12=y[0],m13=z[0],m21=x[1],m22=y[1],m23=z[1],m31=x[2],m32=y[2],m33=z[2];
    const tr=m11+m22+m33;let q;
    if(tr>0){const k=.5/Math.sqrt(tr+1);q=[(m32-m23)*k,(m13-m31)*k,(m21-m12)*k,.25/k];}
    else if(m11>m22&&m11>m33){const k=2*Math.sqrt(1+m11-m22-m33);q=[.25*k,(m12+m21)/k,(m13+m31)/k,(m32-m23)/k];}
    else if(m22>m33){const k=2*Math.sqrt(1+m22-m11-m33);q=[(m12+m21)/k,.25*k,(m23+m32)/k,(m13-m31)/k];}
    else {const k=2*Math.sqrt(1+m33-m11-m22);q=[(m13+m31)/k,(m23+m32)/k,.25*k,(m21-m12)/k];}
    const near=.015*transform.scale,far=50,f=1/Math.tan(s.fov*Math.PI/360);
    return { position:[...s.eye], quaternion:q, projection:[f/(width/height),0,0,0,0,f,0,0,0,0,-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0] };
  };
  const expected = (width,height) => state && ({seat:state.seat,preset:'interior',fov:state.fov,pose:pose(width,height),destination:[...state.eye],target:[...state.target]});
  const nearTuple=(a,b,e=1e-8)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<=e);
  const compare = (actual,width,height) => {
    const want=expected(width,height);if(!want||!actual?.pose)return false;
    const a=actual.pose,b=want.pose;
    return nearTuple(a.position,b.position)&&nearTuple(a.projection,b.projection)&&
      (nearTuple(a.quaternion,b.quaternion)||nearTuple(a.quaternion,b.quaternion.map(v=>-v)));
  };
  return {reset,input,expected,compare,get pointerDown(){return !!pointer;},get state(){return state&&JSON.parse(JSON.stringify(state));}};
}
