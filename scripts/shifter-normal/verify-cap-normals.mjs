/** Exact-preimage, CPU-only cap-normal contract. No filesystem, network, rendering, or writes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const BASELINE_SHA256 = 'ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0';
export const BASELINE_BYTES = 20196108;
export const NORMAL_TARGETS = Object.freeze([
  Object.freeze({mesh:163, primitive:0, normal:1087, position:1088, view:1096, count:580, intercept:.541,
    rows:Object.freeze([0,1,7,8,11,12,16,17,20,21,32,33,35,36,38,39,65,67,68,72,73,78,79,82,83,86,87,90,95,100,105,109,113,117,121,126,151,153,154,159,162,168,176,186,197,200,207,215,223,228,233,238,239,245,246,251,252,256,257,264,265,267,268,271,272,276,277,283,289])}),
  Object.freeze({mesh:164, primitive:0, normal:555, position:556, view:555, count:343, intercept:.545,
    rows:Object.freeze([0,4,7,28,31,34,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,86,89,92,94,99,104,109,114,117,120,125,130,135,138,141,144,147,150,153,160,163,166,169,172])}),
]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function decodeGlb(raw) {
  assert.ok(Buffer.isBuffer(raw), 'GLB input must be a Buffer');
  assert.ok(raw.length>=28, 'GLB too short');
  assert.equal(raw.toString('ascii',0,4),'glTF','GLB magic');
  assert.equal(raw.readUInt32LE(4),2,'GLB version');
  assert.equal(raw.readUInt32LE(8),raw.length,'GLB exact declared length');
  const jsonLength=raw.readUInt32LE(12);
  assert.equal(jsonLength%4,0,'JSON alignment');
  assert.ok(28+jsonLength<=raw.length,'JSON chunk bounds');
  assert.equal(raw.readUInt32LE(16),0x4e4f534a,'JSON chunk type');
  assert.equal(raw.readUInt32LE(24+jsonLength),0x004e4942,'BIN chunk type');
  const binLength=raw.readUInt32LE(20+jsonLength);
  assert.equal(binLength%4,0,'BIN alignment');
  assert.equal(28+jsonLength+binLength,raw.length,'exact two-chunk GLB');
  const jsonText=raw.subarray(20,20+jsonLength).toString('utf8').trimEnd();
  const unpadded=Buffer.from(jsonText,'utf8');
  assert.deepEqual(raw.subarray(20,20+jsonLength),Buffer.concat([unpadded,Buffer.alloc((4-unpadded.length%4)%4,0x20)]),'minimal canonical JSON padding');
  const json=JSON.parse(jsonText);
  assert.equal(json.buffers.length,1,'one embedded buffer');
  assert.equal(json.buffers[0].uri,undefined,'embedded buffer only');
  assert.equal(json.buffers[0].byteLength,binLength,'exact declared BIN allocation');
  return {json,jsonText,bin:raw.subarray(28+jsonLength),jsonLength};
}
export function vectorOffset(doc,accessorId,row=0) {
  const a=doc.json.accessors[accessorId],v=doc.json.bufferViews[a.bufferView];
  return (v.byteOffset??0)+(a.byteOffset??0)+row*(v.byteStride??12);
}
export function readVector(doc,accessorId,row) {
  const offset=vectorOffset(doc,accessorId,row);
  return [doc.bin.readFloatLE(offset),doc.bin.readFloatLE(offset+4),doc.bin.readFloatLE(offset+8)];
}
export function analyticNormal(x) {
  const n=[3.4*x,1,-.46],m=Math.hypot(...n);
  return n.map(value=>Math.fround(value/m));
}
export function normalExtrema(doc,accessorId) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let row=0;row<doc.json.accessors[accessorId].count;row++){
    const values=readVector(doc,accessorId,row);
    assert.ok(values.every(Number.isFinite),'non-finite NORMAL');
    for(let k=0;k<3;k++){min[k]=Math.min(min[k],values[k]);max[k]=Math.max(max[k],values[k]);}
  }
  return {min,max};
}
function assertExclusive(doc,t) {
  const {json}=doc,a=json.accessors[t.normal],v=json.bufferViews[a.bufferView];
  assert.equal(json.meshes[t.mesh].primitives.length,1,'target has one primitive');
  const primitive=json.meshes[t.mesh].primitives[t.primitive];
  assert.equal(primitive.attributes.NORMAL,t.normal,'pinned NORMAL accessor');
  assert.equal(primitive.attributes.POSITION,t.position,'pinned POSITION accessor');
  assert.equal(primitive.attributes.TANGENT,undefined,'no stored TANGENT frame');
  assert.equal(a.bufferView,t.view,'pinned NORMAL bufferView');
  assert.equal(a.count,t.count,'pinned NORMAL count');
  assert.equal(a.componentType,5126,'FLOAT32 NORMAL');assert.equal(a.type,'VEC3');
  assert.equal(a.sparse,undefined,'dense NORMAL');assert.equal(a.normalized,undefined);
  assert.equal(a.byteOffset??0,0);assert.equal(v.byteStride??12,12);
  assert.equal(v.byteLength,t.count*12,'exact NORMAL buffer allocation');assert.equal(v.buffer,0);
  assert.ok(v.byteOffset>=0&&v.byteOffset+v.byteLength<=doc.bin.length,'NORMAL range bounds');
  const references=[];
  for(const [mi,m]of json.meshes.entries())for(const [pi,p]of m.primitives.entries()){
    for(const [semantic,id]of Object.entries(p.attributes))if(id===t.normal)references.push([mi,pi,semantic]);
    assert.notEqual(p.indices,t.normal,'NORMAL is not indices');
    for(const target of p.targets??[])for(const id of Object.values(target))assert.notEqual(id,t.normal,'NORMAL is not morph target');
  }
  for(const skin of json.skins??[])assert.notEqual(skin.inverseBindMatrices,t.normal);
  for(const animation of json.animations??[])for(const sampler of animation.samplers){assert.notEqual(sampler.input,t.normal);assert.notEqual(sampler.output,t.normal);}
  assert.deepEqual(references,[[t.mesh,t.primitive,'NORMAL']],'exclusive NORMAL accessor ownership');
  assert.equal(json.accessors.filter(accessor=>accessor.bufferView===t.view).length,1,'exclusive bufferView accessor');
  for(const accessor of json.accessors)for(const sparse of Object.values(accessor.sparse??{}))if(sparse&&typeof sparse==='object')assert.notEqual(sparse.bufferView,t.view);
  for(const image of json.images)assert.notEqual(image.bufferView,t.view,'image is not NORMAL data');
  for(const [id,other]of json.bufferViews.entries())if(id!==t.view){
    const start=other.byteOffset??0;
    assert.ok(other.buffer!==0||start>=v.byteOffset+v.byteLength||start+other.byteLength<=v.byteOffset,`NORMAL buffer overlaps bufferView ${id}`);
  }
}
function baselineDocument(raw) {
  assert.equal(raw.length,BASELINE_BYTES,'pinned baseline byte length');
  assert.equal(sha256(raw),BASELINE_SHA256,'pinned baseline SHA-256');
  const doc=decodeGlb(raw),mask=[];
  for(const t of NORMAL_TARGETS){
    assertExclusive(doc,t);
    assert.equal(doc.json.accessors[t.position].count,t.count);
    const selected=[],included=[],excluded=[];
    for(let row=0;row<t.count;row++){
      const [x,y,z]=readVector(doc,t.position,row);
      assert.ok([x,y,z].every(Number.isFinite));
      const residual=Math.abs(y-(t.intercept+.46*z-1.7*x*x));
      if(residual<.000040){selected.push(row);included.push(residual);}else excluded.push(residual);
    }
    assert.deepEqual(selected,t.rows,'exact pinned cap row set');
    const maximumIncludedResidualM=Math.max(...included),minimumExcludedResidualM=Math.min(...excluded);
    assert.ok(maximumIncludedResidualM<.000027,'selected residual bound');
    assert.ok(minimumExcludedResidualM>.0000615,'excluded residual gap');
    mask.push({...t,maximumIncludedResidualM,minimumExcludedResidualM});
  }
  return {doc,mask};
}
export function inspectPinnedBaseline(raw) {
  const {mask}=baselineDocument(raw);
  return {sha256:BASELINE_SHA256,bytes:BASELINE_BYTES,targets:mask,selectedRows:115,allowedNormalByteSlots:1380};
}
export function verifyCapNormalCandidate(baselineRaw,candidateRaw) {
  const {doc:before,mask}=baselineDocument(baselineRaw),after=decodeGlb(candidateRaw);
  assert.equal(after.bin.length,before.bin.length,'no added binary allocation');
  const restored=structuredClone(after.json),allowed=new Uint8Array(before.bin.length),changes=[];
  let restoredText=after.jsonText,changedRows=0,maxUnitError=0;
  for(const t of NORMAL_TARGETS){
    assertExclusive(after,t);
    for(const row of t.rows){
      const actual=readVector(after,t.normal,row),expected=analyticNormal(readVector(before,t.position,row)[0]);
      assert.deepEqual(actual,expected,`mesh ${t.mesh} row ${row}: exact analytic FLOAT32 NORMAL`);
      assert.ok(actual.every(Number.isFinite),'finite selected NORMAL');
      const unitError=Math.abs(Math.hypot(...actual)-1);maxUnitError=Math.max(maxUnitError,unitError);
      assert.ok(unitError<6e-8,'unit selected NORMAL');
      const offset=vectorOffset(before,t.normal,row);
      assert.ok(!before.bin.subarray(offset,offset+12).equals(after.bin.subarray(offset,offset+12)),'every selected row corrected');
      allowed.fill(1,offset,offset+12);changedRows++;
    }
    const original=before.json.accessors[t.normal],updated=after.json.accessors[t.normal],expectedExtrema=normalExtrema(after,t.normal);
    assert.deepEqual(updated.min,expectedExtrema.min,'exact recomputed NORMAL minimum');
    assert.deepEqual(updated.max,expectedExtrema.max,'exact recomputed NORMAL maximum');
    for(const key of ['min','max']){
      for(let k=0;k<3;k++)if(!Object.is(original[key][k],updated[key][k]))changes.push({path:`accessors[${t.normal}].${key}[${k}]`,before:original[key][k],after:updated[key][k]});
      restored.accessors[t.normal][key]=original[key];
    }
    const updatedToken=JSON.stringify(updated),originalToken=JSON.stringify(original);
    assert.ok(restoredText.includes(updatedToken),'candidate accessor text is canonical at exact edit');
    assert.equal(restoredText.indexOf(updatedToken),restoredText.lastIndexOf(updatedToken),'unique candidate accessor token');
    restoredText=restoredText.replace(updatedToken,originalToken);
  }
  assert.equal(changedRows,115,'exact modified row count');
  assert.deepEqual(restored,before.json,'all unrelated JSON semantics preserved');
  assert.equal(restoredText,before.jsonText,'all unrelated JSON text preserved');
  let changedBinaryBytes=0;
  for(let i=0;i<before.bin.length;i++)if(before.bin[i]!==after.bin[i]){
    assert.equal(allowed[i],1,`unselected binary byte ${i} changed`);changedBinaryBytes++;
  }
  assert.ok(changedBinaryBytes>0&&changedBinaryBytes<=1380,'bounded binary diff');
  assert.equal(after.json.images.length,11,'11 authored images');assert.equal(after.json.textures.length,11);
  const images=before.json.images.map((image,index)=>{
    const view=before.json.bufferViews[image.bufferView],start=view.byteOffset??0;
    const old=before.bin.subarray(start,start+view.byteLength),now=after.bin.subarray(start,start+view.byteLength);
    assert.ok(now.equals(old),`image ${index} bytes preserved`);
    return {index,bufferView:image.bufferView,mimeType:image.mimeType,bytes:old.length,sha256:sha256(old)};
  });
  const primitives=after.json.nodes.filter(n=>'mesh'in n).flatMap(n=>after.json.meshes[n.mesh].primitives);
  const indexedTriangles=primitives.reduce((sum,p)=>sum+after.json.accessors[p.indices].count/3,0);
  assert.equal(primitives.length,309);assert.equal(indexedTriangles,505664);
  return {
    baseline:{bytes:baselineRaw.length,sha256:sha256(baselineRaw),jsonBytes:before.jsonLength,binaryBytes:before.bin.length},
    candidate:{bytes:candidateRaw.length,sha256:sha256(candidateRaw),jsonBytes:after.jsonLength,binaryBytes:after.bin.length},
    targets:mask,selectedRows:changedRows,allowedNormalByteSlots:1380,changedBinaryBytes,maxUnitError,
    metadataChanges:changes,images,
    costs:{rawByteDelta:candidateRaw.length-baselineRaw.length,binaryAllocationByteDelta:0,vertexDelta:0,indexDelta:0,triangleDelta:0,materialDelta:0,textureDelta:0,imageDelta:0,primitiveDelta:0,renderPassDelta:0,
      residentPrimitives:primitives.length,indexedTriangles,meshDefinitions:after.json.meshes.length,materialDefinitions:after.json.materials.length,textureDefinitions:after.json.textures.length,imageDefinitions:after.json.images.length},
    scope:'CPU exact-artifact contract only; this does not establish native WebGL appearance, frame time, or GPU teardown.'
  };
}
