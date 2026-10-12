import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as policy from '../scripts/cabin-leather-comparison-policy.mjs';
const contract = 'r35-cabin-fine-roughness-comparison-v1';
const baselineCommit = 'e546526c9c7be993dce0e9d5dfb1a2b17cd0c373';
const request = JSON.parse(await readFile(new URL('../qa/cabin-fine-roughness-comparison-request.json', import.meta.url)));
const env = { CI:'true', GITHUB_ACTIONS:'true', GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'push', GITHUB_SHA:'a'.repeat(40), R35_LEATHER_COMMIT_MESSAGE:'[stage-cabin-fine-roughness-comparison]', R35_LEATHER_LANE:'baseline', R35_QA_VIEWPORT:'desktop' };
const indices = [0,10,13,32,34,35];
const transform = { KHR_texture_transform:{scale:[4,4]} };
const changedReference = {index:1,texCoord:2,extensions:transform};
const baselineBytes = gunzipSync(await readFile(new URL('../qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz', import.meta.url)));
const jsonLength = baselineBytes.readUInt32LE(12);
const original = JSON.parse(baselineBytes.subarray(20,20+jsonLength));
const bin = baselineBytes.subarray(28+jsonLength);
function modelBytes(mutate) {
  const json=structuredClone(original); mutate(json);
  const text=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc(Math.ceil(text.length/4)*4,0x20);text.copy(padded);
  const head=Buffer.alloc(20);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(28+padded.length+bin.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
  const binary=Buffer.alloc(8);binary.writeUInt32LE(bin.length);binary.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([head,padded,binary,bin]);
}
function treatment(json) {json.extensionsUsed.push('KHR_texture_transform');for(const index of indices)json.materials[index].pbrMetallicRoughness.metallicRoughnessTexture.extensions=structuredClone(transform);}
const candidateBytes=modelBytes(treatment);
const expected=bytes=>({bytes:bytes.length,sha256:policy.sha256(bytes)});
function enabledRequest() {
  const r=structuredClone(request),profile=policy.comparisonProfile(contract);r.allow=true;
  r.candidate={commit:'current',source:structuredClone(r.baseline.source),model:{path:'/models/r35-cabin-roughness-uv4-12345678.glb',...expected(candidateBytes),gzipBytes:100,gzipSha256:'a'.repeat(64)},buildFiles:Object.fromEntries(profile.buildPaths.candidate.map(p=>[p,'a'.repeat(64)]))};
  r.candidate.source.files.find(f=>f.path===policy.previewPath).sha256='b'.repeat(64);r.candidate.source.sha256=policy.sha256(JSON.stringify(r.candidate.source.files));
  r.baseline.buildFiles=Object.fromEntries(profile.buildPaths.baseline.map(p=>[p,'a'.repeat(64)]));r.helperPins=Object.fromEntries(profile.helperPaths.map(p=>[p,'a'.repeat(64)]));return r;
}

test('fine mapped contract accepts its separate disabled baseline request',()=>policy.assertSourcePair(request));
test('fine profile has exact fixed baseline, marker, request and closed build/helper paths',()=>{const p=policy.comparisonProfile(contract);assert.equal(p.baselineCommit,baselineCommit);assert.equal(p.requestPath,'qa/cabin-fine-roughness-comparison-request.json');assert.equal(p.marker,'[stage-cabin-fine-roughness-comparison]');assert.ok(p.buildPaths.candidate.includes('qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz'));assert.ok(p.buildPaths.candidate.includes('qa/cabin-preview/r35-contact-ao-static-faces-roughness-control.glb.gz'));assert.equal(p.buildPaths.candidate.length,9);assert.ok(p.helperPaths.includes('tests/cabin-fine-roughness-comparison.node.mjs'));assert.deepEqual(policy.budgets,{initial:90000,functional:20000,screenshot:45000,lifecycle:30000});});
test('all three markers select only their own fixed request',()=>{assert.equal(policy.comparisonRequestPath('[stage-cabin-fine-roughness-comparison]'),'qa/cabin-fine-roughness-comparison-request.json');assert.equal(policy.comparisonRequestPath('[stage-cabin-roughness-comparison]'),'qa/cabin-roughness-comparison-request.json');assert.equal(policy.comparisonRequestPath('[stage-cabin-leather-comparison]'),'qa/cabin-leather-comparison-request.json');});
for(const message of ['[stage-cabin-fine-roughness-comparison] [stage-cabin-roughness-comparison]','[stage-cabin-fine-roughness-comparison] [stage-cabin-leather-comparison]'])test('fine marker cannot run alongside another treatment: '+message,()=>assert.throws(()=>policy.comparisonRequestPath(message)));
test('fine request requires its own marker and baseline commit',()=>{const r=enabledRequest();assert.equal(policy.validateComparisonEnvironment(env,r).commit,baselineCommit);assert.equal(policy.validateComparisonEnvironment({...env,R35_LEATHER_LANE:'candidate'},r).commit,env.GITHUB_SHA);for(const marker of ['[stage-cabin-roughness-comparison]','[stage-cabin-leather-comparison]'])assert.throws(()=>policy.validateComparisonEnvironment({...env,R35_LEATHER_COMMIT_MESSAGE:marker},r));r.baseline.commit=policy.baselineCommit;assert.throws(()=>policy.assertSourcePair(r));});
test('only six exact four-times ORM transforms and the extension declaration normalize to baseline',()=>{const a=policy.inspectMaterialModel(baselineBytes,expected(baselineBytes),'baseline',baselineBytes,contract),b=policy.inspectMaterialModel(candidateBytes,expected(candidateBytes),'candidate',baselineBytes,contract);assert.equal(a.images.length,11);assert.deepEqual(a.images,b.images);assert.equal(a.binarySha256,b.binarySha256);assert.equal(a.normalizedDocumentSha256,b.normalizedDocumentSha256);assert.deepEqual(b.changes,indices.map(index=>({index,name:original.materials[index].name,metallicRoughnessTexture:{before:{index:1,texCoord:2},after:changedReference}})));});
for(const [name,mutate] of [
 ['normal strength',j=>j.materials[0].normalTexture.scale=.35],
 ['roughness amplitude',j=>j.materials[0].pbrMetallicRoughness.roughnessFactor=.97],
 ['constant surface',j=>delete j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture],
 ['wrong map reference',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.index=0],
 ['wrong UV set',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.texCoord=1],
 ['different scale',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.extensions.KHR_texture_transform.scale=[2,2]],
 ['extra offset',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.extensions.KHR_texture_transform.offset=[0,0]],
 ['extra rotation',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.extensions.KHR_texture_transform.rotation=0],
 ['transform UV override',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.extensions.KHR_texture_transform.texCoord=2],
 ['AO transform',j=>j.materials[0].occlusionTexture.extensions=structuredClone(transform)],
 ['normal transform',j=>j.materials[0].normalTexture.extensions=structuredClone(transform)],
 ['seventh material transform',j=>j.materials[1].pbrMetallicRoughness.metallicRoughnessTexture={index:1,texCoord:2,extensions:structuredClone(transform)}],
 ['missing extension declaration',j=>j.extensionsUsed.pop()],
 ['extra required extension',j=>j.extensionsRequired.push('KHR_texture_transform')],
 ['duplicate declaration',j=>j.extensionsUsed.push('KHR_texture_transform')],
 ['base color',j=>j.materials[0].pbrMetallicRoughness.baseColorFactor[0]=.1],
])test('fine treatment rejects '+name,()=>{const bytes=modelBytes(j=>{treatment(j);mutate(j);});assert.throws(()=>policy.inspectMaterialModel(bytes,expected(bytes),'candidate',baselineBytes,contract));});
test('fine treatment rejects repinned BIN changes',()=>{const bytes=Buffer.from(candidateBytes);bytes[bytes.length-4]^=1;assert.throws(()=>policy.inspectMaterialModel(bytes,expected(bytes),'candidate',baselineBytes,contract),/immutable/);});
for(const legacy of [policy.contract,policy.roughnessContract])test('historical treatment does not accept fine transforms: '+legacy,()=>assert.throws(()=>policy.inspectMaterialModel(candidateBytes,expected(candidateBytes),'candidate',baselineBytes,legacy)));

// Minimal complete evidence fixtures mirror the unchanged native receipt and frame contract.
const {budgets,comparisonSettings}=policy;
function native(seat='driver'){
 const ratio=Math.min(2,1.5,Math.sqrt(2000000/(1440*744)));
 const snapshot={live:true,camera:{settled:true,preset:'interior',requestId:1},vehicle:{environment:'studio',environmentRequest:0,lights:false,cabinSeat:seat,exterior:true,full:seat!==null,proxy:false},dimensions:{cssWidth:1440,renderWidth:1440,cssHeight:744,renderHeight:744,pixelRatio:ratio,width:1967,height:1016},pose:{position:[1,2,3],quaternion:[0,0,0,1],projection:Array(16).fill(0)}};
 const certificate={owner:1,mainDrawId:2,fenceId:3,drainFenceId:4,nativeStatus:0x911a,drainNativeStatus:0x911c,reusedUnchanged:false,armedAt:0,readyAt:6,snapshot};
 const observation={issues:[],events:[{kind:'main',owner:1,id:2,at:1,stable:true,snapshot},{kind:'fence',owner:1,id:3,at:2,draws:[2]},{kind:'wait',owner:1,id:3,at:3,status:0x911a},{kind:'fence',owner:1,id:4,at:4,draws:[]},{kind:'wait',owner:1,id:4,at:5,status:0x911c}]};return{certificate,observation};
}
function receiptFixture(model){return{version:1,buffers:{maxResourceBufferSize:32*1024*1024,maxTotalBufferSize:128*1024*1024},baseUrl:'http://127.0.0.1:4178',model:{...model},errors:[],native:{requestId:'native-28',url:'http://127.0.0.1:4178'+model.path,method:'GET',status:200,cached:false,terminal:'finished',requestSequence:1,responseSequence:2,finishedSequence:3,encodedTotalBytes:model.gzipBytes+100,headers:{'content-encoding':'gzip','content-length':String(model.gzipBytes)}},playwright:{requestId:28,generation:1,url:'http://127.0.0.1:4178'+model.path,method:'GET',status:200,bodyRequested:true},body:{nativeRequestId:'native-28',source:'CDP.Network.getResponseBody',base64Encoded:true,bytes:model.bytes,sha256:model.sha256,completedSequence:4}};}
function reports(){const r=enabledRequest(),rows=['baseline','candidate'].map(lane=>{const first=native('driver'),second=native('passenger');second.certificate.mainDrawId=6;second.certificate.fenceId=7;second.certificate.drainFenceId=8;second.certificate.readyAt=16;for(const e of second.observation.events){e.at+=10;e.id+=4;if(e.draws)e.draws=e.draws.map(v=>v+4);}const bitmapIds=Array.from({length:11},(_,i)=>i+1);return{result:'passed',lane,contract:r.contract,source:r[lane].source,model:r[lane].model,budgets,quality:'standard',viewport:'desktop',harnessCommit:env.GITHUB_SHA,sourceCommit:lane==='baseline'?baselineCommit:env.GITHUB_SHA,settings:comparisonSettings('desktop'),errors:[],pageErrors:[],console:[],cleanup:{receipts:'passed',context:'closed',browser:'closed',server:'closed'},runtimeBodyLedger:{state:'finished',errors:[],lateEvents:[],requests:[{requestId:28,generation:1,url:'http://127.0.0.1:4178'+r[lane].model.path,path:r[lane].model.path,status:200,sha256:r[lane].model.sha256,bytes:r[lane].model.bytes,state:'body-completed'}]},nativeModelReceipt:receiptFixture(r[lane].model),residentCohort:{bitmapIds,textureIds:[1]},resources:{issues:[],pendingBitmapDecodes:0,pendingIdentities:0,bitmaps:bitmapIds.map(id=>({id,closeCalls:1})),textures:[{id:1,bitmapIds,deleteCalls:1,deletedWhileLive:true}]},resourceRetirement:{closedBitmapIds:bitmapIds,deletedTextureIds:[1]},material:{images:Array.from({length:11},(_,i)=>({name:'image-'+i,sha256:'a'.repeat(64),bytes:10})),changes:lane==='candidate'?indices.map(index=>({index,metallicRoughnessTexture:{before:{index:1,texCoord:2},after:changedReference}})):[],binarySha256:'a',normalizedDocumentSha256:'b'},observation:{issues:[],contexts:[{id:1,owner:1}],resources:[{kind:'program',id:1,contextId:1,deleted:1,deletedLive:true}],events:[...first.observation.events,...second.observation.events]},captures:[['driver',first],['passenger',second]].map(([label,n])=>({label,file:label+'.png',sha256:'c'.repeat(64),certificate:n.certificate,bounds:{x:0,y:100,width:1440,height:744},renderer:{renderer:'SwiftShader',antialias:true,samples:4,sampleBuffers:1}}))};});return{r,rows};}


test('fine matched pair carries native allocation observations without a performance claim',()=>{const {r,rows}=reports();const result=policy.assertMatchedPair(...rows,r);assert.equal(result.matched,true);assert.deepEqual(result.nativeAllocations.residentCabinWebGLTextures,{baseline:1,candidate:1,delta:0});assert.deepEqual(result.nativeAllocations.sceneWebGLProgramAllocations,{baseline:1,candidate:1,delta:0});assert.match(result.nativeAllocations.scope,/not Three.js Texture objects or per-material shader defines/);});
for(const [name,mutate] of [
 ['constant-control report',row=>row.contract=policy.roughnessContract],
 ['constant-control changes',row=>row.material.changes=indices.map(index=>({index,roughnessFactor:{before:.98,after:162/255*.98},metallicRoughnessTexture:{before:{index:1,texCoord:2},after:null}}))],
 ['missing image identity',row=>row.material.images.pop()],
 ['missing native receipt',row=>delete row.nativeModelReceipt],
 ['bitmap retirement leak',row=>row.resources.bitmaps[0].closeCalls=0],
])test('fine pair rejects '+name,()=>{const {r,rows}=reports();mutate(rows[1]);assert.throws(()=>policy.assertMatchedPair(...rows,r));});
test('collector is fully byte-identical to the proven constant-control collector',async()=>{const bytes=await readFile(new URL('../scripts/collect-cabin-leather-comparison.mjs',import.meta.url));assert.equal(policy.sha256(bytes),'55b4447832474776d78b883ccd4daf4abdb9797ad70ff01159c244cc8e0eb0d8');});
test('same four-cell workflow adds only explicit fine eligibility and focused coverage',async()=>{const text=await readFile(new URL('../.github/workflows/cabin-leather-comparison.yml',import.meta.url),'utf8');assert.ok(text.includes("'qa/cabin-fine-roughness-comparison-request.json'"));assert.ok(text.includes('[stage-cabin-fine-roughness-comparison]'));assert.ok(text.includes('tests/cabin-fine-roughness-comparison.node.mjs'));assert.ok(text.includes('lane: [baseline, candidate]'));assert.ok(text.includes('viewport: [desktop, mobile]'));assert.ok(text.includes('ln -s ../app/node_modules harness/node_modules'));});
