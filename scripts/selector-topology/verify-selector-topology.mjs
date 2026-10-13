/** Frozen CPU-only model contract. No Python, browser, socket, or renderer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const baselinePin='ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0';
const candidatePin='699bea11244bcb695fee412bb4668d074c0330550c62385e235b417e78dba7b2';
const provenancePin='45a317ca3c932cc1c1c3f40635eefaf3b7b5f0d6414e3b7071336a57db9fb42b';
const candidateGzipPin='eff3624270a69066857be4c25b8ddd1e352cc5fc78b3041679f858e1323657be';
const baselineGzipPin='b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5';
const targets=new Set([163,164]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a);
const unit=a=>a.map(x=>x/len(a));
const cross2=(a,b)=>a[0]*b[2]-a[2]*b[0];
const normal=p=>unit([3.4*p[0],1,-.46]);
const f32key=p=>{const b=Buffer.alloc(12);p.forEach((x,i)=>b.writeFloatLE(x,i*4));return b.toString('hex');};
function decode(raw){
 assert.ok(Buffer.isBuffer(raw),'GLB inputs must be Node Buffers');assert.equal(raw.toString('ascii',0,4),'glTF');assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);
 const n=raw.readUInt32LE(12);assert.equal(raw.readUInt32LE(16),0x4e4f534a);const j=JSON.parse(raw.toString('utf8',20,20+n));assert.equal(raw.readUInt32LE(24+n),0x004e4942);const bin=raw.subarray(28+n);assert.equal(bin.length,raw.readUInt32LE(20+n));
 return {raw,j,bin};
}
const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const readers={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function accessor(m,i,rows=false){
 const a=m.j.accessors[i],v=m.j.bufferViews[a.bufferView],d=dims[a.type],s=sizes[a.componentType],width=d*s,stride=v.byteStride??width,start=(v.byteOffset??0)+(a.byteOffset??0);
 assert.ok(Number.isInteger(a.count)&&a.count>=0);assert.ok(start+(a.count-1)*stride+width<=m.bin.length);const out=Buffer.alloc(a.count*width),values=rows?[]:null;
 for(let r=0;r<a.count;r++){m.bin.copy(out,r*width,start+r*stride,start+r*stride+width);if(rows)values.push(Array.from({length:d},(_,c)=>m.bin[readers[a.componentType]](start+r*stride+c*s)));}
 return rows?values:out;
}
function mesh(m,mi){const p=m.j.meshes[mi].primitives[0];return {p,attrs:Object.fromEntries(Object.entries(p.attributes).map(([k,v])=>[k,accessor(m,v,true)])),faces:accessor(m,p.indices,true).map(x=>x[0]).reduce((all,x,i)=>{if(i%3===0)all.push([]);all.at(-1).push(x);return all;},[])};}
const view=(m,i)=>{const v=m.j.bufferViews[i];return m.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);};
const countTriangles=m=>m.j.meshes.reduce((s,x)=>s+x.primitives.reduce((n,p)=>n+m.j.accessors[p.indices].count/3,0),0);
const countPrimitives=m=>m.j.meshes.reduce((s,x)=>s+x.primitives.length,0);
function geometric(m){const p=m.attrs.POSITION;return m.faces.map(f=>{const c=cross(sub(p[f[1]],p[f[0]]),sub(p[f[2]],p[f[0]]));assert.ok(len(c)>1e-12,'Degenerate target triangle');return unit(c);});}
function extrema(p){return [0,1,2].map(i=>[Math.min(...p.map(x=>x[i])),Math.max(...p.map(x=>x[i]))]);}
function seamGroups(m){const groups=new Map();for(let i=0;i<m.attrs.POSITION.length;i++){const k=f32key(m.attrs.POSITION[i]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(m.attrs.NORMAL[i]);}return new Map([...groups].filter(([,ns])=>ns.some(n=>len(sub(n,ns[0]))>5e-6)).map(([k,ns])=>[k,[...new Set(ns.map(f32key))].sort()]));}
function verifyGeometry(old,next,r){
 const p=next.attrs.POSITION,n=next.attrs.NORMAL,op=old.attrs.POSITION;assert.equal(r.vertices.length,p.length);assert.equal(r.faceSource.length,next.faces.length);assert.deepEqual(Object.keys(next.attrs),Object.keys(old.attrs));assert.deepEqual(extrema(p),extrema(op));
 const oldNormals=geometric(old),faceNormals=geometric(next),groups=new Map(),edgeCounts=new Map();let minCorner=1,minSource=1,maxRounding=0,aligned=0,alignedFaces=0;
 const coordKey=p.map(f32key);const oldHard=seamGroups(old),newHard=seamGroups(next);assert.deepEqual(newHard,oldHard,'Existing hard seams must be unchanged');
 for(let i=0;i<p.length;i++){
  for(const values of Object.values(next.attrs))assert.ok(values[i].every(Number.isFinite));assert.ok(Math.abs(len(n[i])-1)<2e-6);
  const v=r.vertices[i],w=v.weights,of=old.faces[v.face];assert.equal(w.length,3);assert.ok(w.every(x=>x>=-1e-12));assert.ok(Math.abs(w.reduce((s,x)=>s+x,0)-1)<1e-12);
  const interp=key=>old.attrs[key][of[0]].map((_,c)=>w.reduce((s,t,k)=>s+t*old.attrs[key][of[k]][c],0));
  const expected=interp('POSITION'),err=len(sub(p[i],expected));maxRounding=Math.max(maxRounding,err);assert.ok(err<3.1e-8,'Vertex left accepted source surface');
  for(const key of Object.keys(old.attrs)){
   const target=interp(key),actual=next.attrs[key][i];
   if(!v.patch)assert.deepEqual(actual,target.map(Math.fround),'Retained shell attribute changed');
   if(key.startsWith('TEXCOORD'))for(let c=0;c<target.length;c++){
    const ai=old.p.attributes[key];const integer=old._model.j.accessors[ai].componentType!==5126;
    assert.ok(Math.abs(actual[c]-target[c])<=(integer?.5000001:Math.max(1e-8,Math.abs(target[c])*7e-8)),'UV left original source chart');
   }
  }
  if(v.patch&&v.distance<1e-12)assert.ok(len(sub(n[i],unit(interp('NORMAL'))))<2e-7,'Boundary shading normal changed');
  if(v.patch&&v.distance>=r.support-1e-10)assert.ok(dot(n[i],normal(p[i]))>1-2e-7,'Cap support normal is not source-derived');
  if(dot(n[i],normal(p[i]))>1-2e-7)aligned++;
  groups.set(coordKey[i],true);
 }
 const projectedSums=Array(old.faces.length).fill(0);
 for(let i=0;i<next.faces.length;i++){
  const f=next.faces[i],source=r.faceSource[i];minSource=Math.min(minSource,dot(faceNormals[i],oldNormals[source]));assert.ok(dot(faceNormals[i],oldNormals[source])>.999,'Changed source-face orientation');
  const area=cross2(sub(p[f[1]],p[f[0]]),sub(p[f[2]],p[f[0]]));projectedSums[source]+=area;
  const of=old.faces[source],oa=cross2(sub(op[of[1]],op[of[0]]),sub(op[of[2]],op[of[0]]));assert.ok(area*oa>=-1e-16,'Projected triangle flipped');
  if(f.every(v=>dot(n[v],normal(p[v]))>1-2e-7))alignedFaces++;
  for(let k=0;k<3;k++){
   minCorner=Math.min(minCorner,dot(faceNormals[i],n[f[k]]));const a=coordKey[f[k]],b=coordKey[f[(k+1)%3]],key=[a,b].sort().join(':');const e=edgeCounts.get(key)??[0,0];e[0]++;e[1]+=a<b?1:-1;edgeCounts.set(key,e);
  }
 }
 assert.ok(minCorner>0,'Normal opposes geometric face');assert.ok(aligned>=120&&alignedFaces>=80,'Missing explicit cap-normal support');
 for(let i=0;i<old.faces.length;i++){const f=old.faces[i],a=cross2(sub(op[f[1]],op[f[0]]),sub(op[f[2]],op[f[0]]));assert.ok(Math.abs(projectedSums[i]-a)<=3e-10+2e-5*Math.abs(a),'Source projected domain changed');}
 for(const [count,balance] of edgeCounts.values()){assert.equal(count,2,'Nonmanifold/open edge');assert.equal(balance,0,'Inconsistent face winding');}
 assert.equal(groups.size-edgeCounts.size+next.faces.length,0,'Target genus changed');
 for(const [a,b] of r.boundaryPositions)assert.ok(edgeCounts.has([f32key(a),f32key(b)].sort().join(':')),'Exact boundary segment missing');
 return {mesh:r.mesh,oldVertices:op.length,newVertices:p.length,oldTriangles:old.faces.length,newTriangles:next.faces.length,closedOrientedManifold:true,exactThreeAxisExtrema:true,exactBoundarySegments:r.boundaryPositions.length,uvOwnership:true,existingHardSeams:oldHard.size,addedHardSeams:0,minimumFaceVertexNormalDot:minCorner,minimumSourceFaceNormalDot:minSource,maxSubdivisionRoundingMeters:maxRounding,capNormalVertices:aligned,capNormalFaces:alignedFaces};
}
/** Optional gzip buffers avoid path coupling when incorporated into a reviewed CI closure. */
export function verifySelectorTopologyCandidate(baselineBytes,candidateBytes,compressed={}){
 assert.ok(Buffer.isBuffer(baselineBytes));assert.ok(Buffer.isBuffer(candidateBytes),'Missing candidate buffer');assert.equal(sha(baselineBytes),baselinePin,'Unpinned baseline');assert.equal(sha(candidateBytes),candidatePin,'Unpinned candidate');
 const provenanceBytes=readFileSync(new URL('./selector-topology-provenance.json',import.meta.url));assert.equal(sha(provenanceBytes),provenancePin);const provenance=JSON.parse(provenanceBytes);
 const baselineGzip=compressed.baselineGzipBytes??readFileSync(new URL('../../qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz',import.meta.url));
 const candidateGzip=compressed.candidateGzipBytes??readFileSync(new URL('../../qa/cabin-preview/r35-cabin-selector-topology.glb.gz',import.meta.url));
 assert.equal(sha(baselineGzip),baselineGzipPin);assert.equal(sha(candidateGzip),candidateGzipPin);assert.deepEqual(gunzipSync(baselineGzip),baselineBytes);assert.deepEqual(gunzipSync(candidateGzip),candidateBytes);
 const old=decode(baselineBytes),next=decode(candidateBytes),changedAccessors=new Set();let unaffected=0,geometryBytesBefore=0,geometryBytesAfter=0;
 for(const mi of targets){const p=old.j.meshes[mi].primitives[0];for(const i of [p.indices,...Object.values(p.attributes)]){changedAccessors.add(i);geometryBytesBefore+=accessor(old,i).length;geometryBytesAfter+=accessor(next,i).length;}}
 const changedViews=new Set([...changedAccessors].map(i=>old.j.accessors[i].bufferView));
 for(const i of changedAccessors){const a={...old.j.accessors[i]},b={...next.j.accessors[i]};for(const k of ['count','min','max']){delete a[k];delete b[k];}assert.deepEqual(a,b,'Target attribute storage/UV ownership changed');}
 for(const key of Object.keys(old.j))if(!['accessors','bufferViews','buffers','nodes'].includes(key))assert.deepEqual(next.j[key],old.j[key],`Unexpected document change: ${key}`);
 assert.equal(old.j.accessors.length,next.j.accessors.length);assert.equal(old.j.bufferViews.length,next.j.bufferViews.length);
 for(let i=0;i<old.j.accessors.length;i++)if(!changedAccessors.has(i))assert.deepEqual(old.j.accessors[i],next.j.accessors[i]);
 for(let i=0;i<old.j.bufferViews.length;i++)if(!changedViews.has(i))assert.deepEqual(view(old,i),view(next,i),'Unrelated buffer-view bytes changed');
 for(let mi=0;mi<old.j.meshes.length;mi++)if(!targets.has(mi))for(const p of old.j.meshes[mi].primitives){for(const i of [p.indices,...Object.values(p.attributes)])assert.deepEqual(accessor(old,i),accessor(next,i));unaffected++;}
 for(const im of old.j.images)assert.deepEqual(view(old,im.bufferView),view(next,im.bufferView));
 const nodes=structuredClone(next.j.nodes),geometry=[];
 for(const r of provenance){const a=mesh(old,r.mesh),b=mesh(next,r.mesh);a._model=old;b._model=next;geometry.push(verifyGeometry(a,b,r));
  for(let i=0;i<nodes.length;i++)if(nodes[i].mesh===r.mesh){const part=nodes[i].extras.parts[0];assert.equal(part.vertexCount,b.attrs.POSITION.length);assert.equal(part.indexCount,b.faces.length*3);part.vertexCount=old.j.nodes[i].extras.parts[0].vertexCount;part.indexCount=old.j.nodes[i].extras.parts[0].indexCount;}}
 assert.deepEqual(nodes,old.j.nodes);
 const costs={rawByteDelta:candidateBytes.length-baselineBytes.length,gzipByteDelta:candidateGzip.length-baselineGzip.length,geometryAttributeIndexByteDelta:geometryBytesAfter-geometryBytesBefore,triangleDelta:countTriangles(next)-countTriangles(old),primitiveDelta:countPrimitives(next)-countPrimitives(old),materialDelta:next.j.materials.length-old.j.materials.length,textureDelta:next.j.textures.length-old.j.textures.length,imageDelta:next.j.images.length-old.j.images.length,renderPassDelta:0,residentPrimitives:countPrimitives(next),indexedTriangles:countTriangles(next)};
 assert.ok(costs.rawByteDelta<=100000&&costs.triangleDelta<=2000);assert.equal(unaffected,307);assert.equal(old.j.images.length,11);
 return {verified:true,baseline:{sha256:sha(baselineBytes),bytes:baselineBytes.length,gzipSha256:sha(baselineGzip),gzipBytes:baselineGzip.length},candidate:{sha256:sha(candidateBytes),bytes:candidateBytes.length,gzipSha256:sha(candidateGzip),gzipBytes:candidateGzip.length},construction:'Accepted-surface subdivision with compact source-derived shading-normal support; no restored quadratic cap geometry',costs,unchanged:{otherPrimitives:unaffected,embeddedImages:old.j.images.length,allMaterials:true,allTextures:true,allSamplers:true,nodesExceptTwoPartCounts:true},geometry,provenanceSha256:provenancePin};
}
