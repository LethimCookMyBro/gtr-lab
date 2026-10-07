import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { inspectEyeClearance } from '../viewer/camera-clearance.js';
import { classifyMesh, WINDOW_ALLOWLIST } from '../viewer/runtime-core.js';
import { createWindowMaterial } from '../viewer/window-materials.js';

const root=new URL('../../../',import.meta.url);
function geometryOnlyGlb(input) {
  const jsonLength=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+jsonLength));
  const offset=20+jsonLength,binary=input.subarray(offset+8,offset+8+input.readUInt32LE(offset));
  // Node geometry/material-role test only. CI must decode all original images in real WebGL.
  json.materials=json.materials.map(material=>({name:material.name,doubleSided:material.doubleSided}));
  delete json.images;delete json.textures;delete json.samplers;
  const serialized=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([serialized,Buffer.alloc((4-serialized.length%4)%4,32)]);
  const output=Buffer.alloc(28+padded.length+binary.length);
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(padded.length,12);output.writeUInt32LE(0x4e4f534a,16);padded.copy(output,20);
  output.writeUInt32LE(binary.length,20+padded.length);output.writeUInt32LE(0x004e4942,24+padded.length);binary.copy(output,28+padded.length);
  return output;
}
async function loadSource() {
  const exterior=geometryOnlyGlb(await readFile(new URL('public/models/ciasny-r35.glb',root)));
  const cabin=gunzipSync(await readFile(new URL('../r35-original-cabin-lod0.glb.gz',import.meta.url)));
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const parse=bytes=>loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const [ext,int]=await Promise.all([parse(exterior),parse(cabin)]);
  const roles=JSON.parse(await readFile(new URL('../roles.json',import.meta.url),'utf8'));
  return {exterior:ext.scene,cabin:int.scene,roles};
}

test('accepted compressed exterior and exact cabin share clear fixed eye points in the actual loader',async()=>{
  const {exterior,cabin,roles}=await loadSource(),combined=new Group();combined.add(exterior,cabin);
  const presets=JSON.parse(await readFile(new URL('../camera-contract.json',import.meta.url),'utf8')).presets;
  const names=[],counts={cabin:0,exterior:0};
  combined.traverse(mesh=>{if(mesh.isMesh){const role=classifyMesh(mesh,roles);counts[role.isCabin?'cabin':'exterior']++;if(role.isWindow)names.push(role.name);}});
  assert.equal(counts.cabin,515);assert.equal(counts.exterior,82);assert.deepEqual(names.sort(),[...WINDOW_ALLOWLIST].sort());
  const results=inspectEyeClearance(combined,presets,1130/1000);
  for(const result of results){assert.equal(result.nearPlaneClearForAllPanDirections,true,JSON.stringify(result));assert.equal(result.trianglesChecked,1012955);}
  console.log(JSON.stringify({scope:'Geometry-only Node decode, not WebGL or original-texture rendering',counts,eyeClearance:results}));
});

test('actual material adapter and four-window overrides protect cabin, lamps and cowl',async()=>{
  const {exterior,cabin,roles}=await loadSource();
  const {prepareVehicle,applyVehicleAppearance}=await import(new URL('.qa-cabin-runtime/viewer/app-source/materialAdapter.js',root));
  const config=JSON.parse(await readFile(new URL('.qa-cabin-runtime/app-appearance.json',root),'utf8'));
  const prepared=prepareVehicle(exterior,config.materialRoles,config.disabledEmissive);
  assert.equal(prepareVehicle(cabin,config.materialRoles,config.disabledEmissive).bindings.length,0,'Cabin materials never become paint or lamp bindings');
  const all=new Group();all.add(prepared.scene,cabin);
  const records=[];
  all.traverse(mesh=>{if(mesh.isMesh)records.push({mesh,...classifyMesh(mesh,roles),baseline:mesh.material,signature:JSON.stringify(mesh.material.toJSON())});});
  const windows=records.filter(record=>record.isWindow);assert.equal(windows.length,4);
  for(const record of windows) {
    record.override=createWindowMaterial(record.baseline);record.mesh.material=record.override;
    assert.notEqual(record.override,record.baseline);assert.equal(record.override.defines.PHYSICAL,'');
  }
  for(const record of records.filter(record=>!record.isWindow))assert.equal(record.mesh.material,record.baseline,record.name);
  assert.equal(records.find(record=>record.name==='Hood.001_Glass_0').isWindow,false);
  assert.ok(records.some(record=>record.name==='Headlights_Glass_0' && !record.isWindow));
  assert.ok(records.some(record=>record.name==='TailightsGlass_Glass_0' && !record.isWindow));
  for(const [paint,lights] of [['#b31625',false],['#b31625',true],['#183f80',true],['#b8bec5',false]]) {
    applyVehicleAppearance(prepared.bindings,paint,lights);
    for(const record of records.filter(record=>record.isCabin || record.isWindow))assert.equal(JSON.stringify(record.baseline.toJSON()),record.signature,record.name);
  }
  assert.ok(prepared.bindings.some(binding=>binding.role==='paint'));
  for(const record of windows){record.mesh.material=record.baseline;record.override.dispose();assert.equal(record.mesh.material,record.baseline);}
});
