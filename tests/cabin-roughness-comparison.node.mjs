import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as policy from '../scripts/cabin-leather-comparison-policy.mjs';
const contract = 'r35-cabin-roughness-control-comparison-v1';
const baselineCommit = 'e546526c9c7be993dce0e9d5dfb1a2b17cd0c373';
const request = JSON.parse(await readFile(new URL('../qa/cabin-roughness-comparison-request.json', import.meta.url)));
const env = { CI:'true', GITHUB_ACTIONS:'true', GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'push', GITHUB_SHA:'a'.repeat(40), R35_LEATHER_COMMIT_MESSAGE:'[stage-cabin-roughness-comparison]', R35_LEATHER_LANE:'baseline', R35_QA_VIEWPORT:'desktop' };
const indices = [0,10,13,32,34,35];
const roughness = 162 / 255 * 0.98;
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
function treatment(json) { for(const index of indices) {const pbr=json.materials[index].pbrMetallicRoughness;pbr.roughnessFactor=roughness;delete pbr.metallicRoughnessTexture;} }
const candidateBytes=modelBytes(treatment);
const expected=bytes=>({bytes:bytes.length,sha256:policy.sha256(bytes)});
function enabledRequest() {
  const r=structuredClone(request),profile=policy.comparisonProfile(contract);r.allow=true;
  r.candidate={commit:'current',source:structuredClone(r.baseline.source),model:{path:'/models/r35-cabin-contact-ao-static-faces-roughness-control-12345678.glb',...expected(candidateBytes),gzipBytes:100,gzipSha256:'a'.repeat(64)},buildFiles:Object.fromEntries(profile.buildPaths.candidate.map(p=>[p,'a'.repeat(64)]))};
  r.candidate.source.files.find(f=>f.path===policy.previewPath).sha256='b'.repeat(64);r.candidate.source.sha256=policy.sha256(JSON.stringify(r.candidate.source.files));
  r.baseline.buildFiles=Object.fromEntries(profile.buildPaths.baseline.map(p=>[p,'a'.repeat(64)]));r.helperPins=Object.fromEntries(profile.helperPaths.map(p=>[p,'a'.repeat(64)]));return r;
}
test('separately named roughness contract accepts disabled exact current baseline',()=>{policy.assertSourcePair(request);});
test('roughness profile retains budgets and distinct candidate build closure',()=>{const p=policy.comparisonProfile(contract);assert.equal(p.baselineCommit,baselineCommit);assert.equal(p.requestPath,'qa/cabin-roughness-comparison-request.json');assert.equal(p.marker,'[stage-cabin-roughness-comparison]');assert.ok(p.buildPaths.candidate.includes('qa/cabin-preview/r35-contact-ao-static-faces-roughness-control.glb.gz'));assert.ok(!p.buildPaths.candidate.includes('qa/cabin-preview/r35-cabin-contact-ao-static-faces-leather.glb.gz'));assert.ok(p.helperPaths.includes('tests/cabin-roughness-comparison.node.mjs'));assert.deepEqual(policy.budgets,{initial:90000,functional:20000,screenshot:45000,lifecycle:30000});});
test('fixed marker selects only its named request',()=>{assert.equal(policy.comparisonRequestPath(env.R35_LEATHER_COMMIT_MESSAGE),'qa/cabin-roughness-comparison-request.json');assert.equal(policy.comparisonRequestPath('[stage-cabin-leather-comparison]'),'qa/cabin-leather-comparison-request.json');});
for(const message of ['', '[stage-cabin-leather-comparison] [stage-cabin-roughness-comparison]', '[stage-cabin-unreviewed-comparison]'])test('missing or ambiguous treatment marker fails closed: '+message,()=>assert.throws(()=>policy.comparisonRequestPath(message)));
test('roughness request needs its matching marker and fixed current baseline',()=>{const r=enabledRequest();assert.equal(policy.validateComparisonEnvironment(env,r).commit,baselineCommit);assert.equal(policy.validateComparisonEnvironment({...env,R35_LEATHER_LANE:'candidate'},r).commit,env.GITHUB_SHA);assert.throws(()=>policy.validateComparisonEnvironment({...env,R35_LEATHER_COMMIT_MESSAGE:'[stage-cabin-leather-comparison]'},r));r.baseline.commit=policy.baselineCommit;assert.throws(()=>policy.assertSourcePair(r));});
test('only exact six constant effective roughness changes pass and normalize to baseline',()=>{const a=policy.inspectMaterialModel(baselineBytes,expected(baselineBytes),'baseline',baselineBytes,contract),b=policy.inspectMaterialModel(candidateBytes,expected(candidateBytes),'candidate',baselineBytes,contract);assert.equal(a.images.length,11);assert.deepEqual(a.images,b.images);assert.equal(a.binarySha256,b.binarySha256);assert.equal(a.normalizedDocumentSha256,b.normalizedDocumentSha256);assert.deepEqual(b.changes,indices.map(index=>({index,name:original.materials[index].name,roughnessFactor:{before:.98,after:roughness},metallicRoughnessTexture:{before:{index:1,texCoord:2},after:null}})));});
for(const [name,mutate] of [
 ['normal strength',j=>j.materials[0].normalTexture.scale=.35],
 ['roughness factor',j=>j.materials[0].pbrMetallicRoughness.roughnessFactor=.623],
 ['roughness map retained',j=>j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture={index:1,texCoord:2}],
 ['metallic factor',j=>j.materials[0].pbrMetallicRoughness.metallicFactor=.1],
 ['AO strength',j=>j.materials[0].occlusionTexture.strength=.8],
 ['base color',j=>j.materials[0].pbrMetallicRoughness.baseColorFactor[0]=.1],
 ['seventh material',j=>j.materials[1].pbrMetallicRoughness.roughnessFactor=.1],
 ['geometry reference',j=>j.meshes[0].primitives[0].indices=99],
]) test('roughness contract rejects '+name,()=>{const bytes=modelBytes(j=>{treatment(j);mutate(j);});assert.throws(()=>policy.inspectMaterialModel(bytes,expected(bytes),'candidate',baselineBytes,contract));});
test('roughness contract rejects modified BIN bytes even when repinned',()=>{const bytes=Buffer.from(candidateBytes);bytes[bytes.length-4]^=1;assert.throws(()=>policy.inspectMaterialModel(bytes,expected(bytes),'candidate',baselineBytes,contract),/immutable/);});
test('legacy normal-only contract still rejects a roughness treatment',()=>assert.throws(()=>policy.inspectMaterialModel(candidateBytes,expected(candidateBytes),'candidate',baselineBytes)));
test('roughness contract rejects the rejected normal-only treatment',()=>{const bytes=modelBytes(j=>{for(const i of indices)j.materials[i].normalTexture.scale=.35;});assert.throws(()=>policy.inspectMaterialModel(bytes,expected(bytes),'candidate',baselineBytes,contract));});

// Minimal complete evidence fixtures mirror the unchanged native receipt and frame contract.
const {budgets,comparisonSettings}=policy;
function native(seat='driver'){
 const ratio=Math.min(2,1.5,Math.sqrt(2000000/(1440*744)));
 const snapshot={live:true,camera:{settled:true,preset:'interior',requestId:1},vehicle:{environment:'studio',environmentRequest:0,lights:false,cabinSeat:seat,exterior:true,full:seat!==null,proxy:false},dimensions:{cssWidth:1440,renderWidth:1440,cssHeight:744,renderHeight:744,pixelRatio:ratio,width:1967,height:1016},pose:{position:[1,2,3],quaternion:[0,0,0,1],projection:Array(16).fill(0)}};
 const certificate={owner:1,mainDrawId:2,fenceId:3,drainFenceId:4,nativeStatus:0x911a,drainNativeStatus:0x911c,reusedUnchanged:false,armedAt:0,readyAt:6,snapshot};
 const observation={issues:[],events:[{kind:'main',owner:1,id:2,at:1,stable:true,snapshot},{kind:'fence',owner:1,id:3,at:2,draws:[2]},{kind:'wait',owner:1,id:3,at:3,status:0x911a},{kind:'fence',owner:1,id:4,at:4,draws:[]},{kind:'wait',owner:1,id:4,at:5,status:0x911c}]};return{certificate,observation};
}
function receiptFixture(model){return{version:1,buffers:{maxResourceBufferSize:32*1024*1024,maxTotalBufferSize:128*1024*1024},baseUrl:'http://127.0.0.1:4178',model:{...model},errors:[],native:{requestId:'native-28',url:'http://127.0.0.1:4178'+model.path,method:'GET',status:200,cached:false,terminal:'finished',requestSequence:1,responseSequence:2,finishedSequence:3,encodedTotalBytes:model.gzipBytes+100,headers:{'content-encoding':'gzip','content-length':String(model.gzipBytes)}},playwright:{requestId:28,generation:1,url:'http://127.0.0.1:4178'+model.path,method:'GET',status:200,bodyRequested:true},body:{nativeRequestId:'native-28',source:'CDP.Network.getResponseBody',base64Encoded:true,bytes:model.bytes,sha256:model.sha256,completedSequence:4}};}
function reports(){const r=enabledRequest(),rows=['baseline','candidate'].map(lane=>{const first=native('driver'),second=native('passenger');second.certificate.mainDrawId=6;second.certificate.fenceId=7;second.certificate.drainFenceId=8;second.certificate.readyAt=16;for(const e of second.observation.events){e.at+=10;e.id+=4;if(e.draws)e.draws=e.draws.map(v=>v+4);}const bitmapIds=Array.from({length:11},(_,i)=>i+1);return{result:'passed',lane,contract:r.contract,source:r[lane].source,model:r[lane].model,budgets,quality:'standard',viewport:'desktop',harnessCommit:env.GITHUB_SHA,sourceCommit:lane==='baseline'?baselineCommit:env.GITHUB_SHA,settings:comparisonSettings('desktop'),errors:[],pageErrors:[],console:[],cleanup:{receipts:'passed',context:'closed',browser:'closed',server:'closed'},runtimeBodyLedger:{state:'finished',errors:[],lateEvents:[],requests:[{requestId:28,generation:1,url:'http://127.0.0.1:4178'+r[lane].model.path,path:r[lane].model.path,status:200,sha256:r[lane].model.sha256,bytes:r[lane].model.bytes,state:'body-completed'}]},nativeModelReceipt:receiptFixture(r[lane].model),residentCohort:{bitmapIds,textureIds:[1]},resources:{issues:[],pendingBitmapDecodes:0,pendingIdentities:0,bitmaps:bitmapIds.map(id=>({id,closeCalls:1})),textures:[{id:1,bitmapIds,deleteCalls:1,deletedWhileLive:true}]},resourceRetirement:{closedBitmapIds:bitmapIds,deletedTextureIds:[1]},material:{images:Array.from({length:11},(_,i)=>({name:'image-'+i,sha256:'a'.repeat(64),bytes:10})),changes:lane==='candidate'?indices.map(index=>({index,roughnessFactor:{before:.98,after:roughness},metallicRoughnessTexture:{before:{index:1,texCoord:2},after:null}})):[],binarySha256:'a',normalizedDocumentSha256:'b'},observation:{issues:[],contexts:[{id:1,owner:1}],resources:[{kind:'program',id:1,contextId:1,deleted:1,deletedLive:true}],events:[...first.observation.events,...second.observation.events]},captures:[['driver',first],['passenger',second]].map(([label,n])=>({label,file:label+'.png',sha256:'c'.repeat(64),certificate:n.certificate,bounds:{x:0,y:100,width:1440,height:744},renderer:{renderer:'SwiftShader',antialias:true,samples:4,sampleBuffers:1}}))};});return{r,rows};}

test('roughness matched pair reports observed native allocation deltas without claiming Texture or define equality',()=>{
  const {r,rows}=reports();const candidate=rows[1];
  candidate.residentCohort.textureIds.push(2);candidate.resources.textures.push({id:2,bitmapIds:[1],deleteCalls:1,deletedWhileLive:true});candidate.resourceRetirement.deletedTextureIds.push(2);
  candidate.observation.resources.push({kind:'program',id:2,contextId:1,deleted:1,deletedLive:true});
  const result=policy.assertMatchedPair(...rows,r);assert.equal(result.matched,true);
  assert.deepEqual(result.nativeAllocations.residentCabinWebGLTextures,{baseline:1,candidate:2,delta:1});
  assert.deepEqual(result.nativeAllocations.sceneWebGLProgramAllocations,{baseline:1,candidate:2,delta:1});
  assert.match(result.nativeAllocations.scope,/not Three.js Texture objects or per-material shader defines/);
});
for(const [name,mutate] of [
 ['normal-only report',row=>row.contract=policy.contract],
 ['normal-only changes',row=>row.material.changes=indices.map(index=>({index,before:.55,after:.35}))],
 ['missing image identity',row=>row.material.images.pop()],
 ['missing native receipt',row=>delete row.nativeModelReceipt],
 ['retirement leak',row=>row.resources.bitmaps[0].closeCalls=0],
 ['missing program allocation observation',row=>delete row.observation.resources],
 ['missing owner context',row=>row.observation.contexts=[]],
])test('roughness pair cannot qualify '+name,()=>{const {r,rows}=reports();mutate(rows[1]);assert.throws(()=>policy.assertMatchedPair(...rows,r));});

test('collector request and treatment are explicitly bound while the full capture sequence stays byte-identical',async()=>{
  const text=await readFile(new URL('../scripts/collect-cabin-leather-comparison.mjs',import.meta.url),'utf8');
  assert.ok(text.includes("comparisonRequestPath(env.R35_LEATHER_COMMIT_MESSAGE??'')"));
  assert.ok(text.includes('contract:request.contract'));
  assert.ok(text.includes('inspectMaterialModel(model,target.expected.model,target.lane,original,request.contract)'));
  assert.equal(policy.sha256(text.slice(text.indexOf('    const exterior='))),'0f2b0380ba0aa32e638e386a6a43a2ef8c664c055639ecd61ca033e3dc8f8b5d');
});
test('shared workflow preserves proven two-root link and adds only explicit roughness eligibility',async()=>{
  const text=await readFile(new URL('../.github/workflows/cabin-leather-comparison.yml',import.meta.url),'utf8');
  assert.ok(text.includes("'qa/cabin-roughness-comparison-request.json'"));assert.ok(text.includes('[stage-cabin-roughness-comparison]'));
  assert.equal(text.match(/ln -s \.\.\/app\/node_modules harness\/node_modules/g)?.length,1);
  assert.ok(text.includes('tests/cabin-roughness-comparison.node.mjs'));
  assert.equal(text.match(/comparisonRequestPath\(process.env.R35_LEATHER_COMMIT_MESSAGE\)/g)?.length,2);
  assert.ok(text.includes("verifyFilePins('app',target.expected.buildFiles,comparisonProfile(request.contract).buildPaths[target.lane])"));
});

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('socket-free replay CLI accepts an explicit archived request and still fails for missing mobile evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'r35-roughness-archive-replay-'));
  try {
    const {r,rows}=reports(),requestPath=join(root,'archived-input-request.json');await writeFile(requestPath,JSON.stringify(r));
    const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1440,16);png.writeUInt32BE(900,20);
    for(const row of rows){const directory=join(root,row.lane+'-desktop');await mkdir(directory);row.requestSha256=policy.sha256(JSON.stringify(r));const first=row.captures[0],second=row.captures[1];row.captures=['initial','driver','passenger','exterior-restored','driver-repeat'].map(label=>({...structuredClone(label==='passenger'?second:first),label,file:label+'.png',bytes:png.length,sha256:policy.sha256(png)}));await writeFile(join(directory,'report.json'),JSON.stringify(row));for(const c of row.captures)await writeFile(join(directory,c.file),png);}
    const script=new URL('../scripts/verify-cabin-leather-pairs.mjs',import.meta.url);
    const result=spawnSync(process.execPath,[...process.execArgv.filter(v=>v!=='--test'),script.pathname,root,requestPath],{encoding:'utf8',timeout:15000});
    assert.equal(result.status,1,'Missing mobile evidence must remain a failure');
    const replay=JSON.parse(await readFile(join(root,'paired-comparison.json')));assert.equal(replay.result,'failed');assert.equal(replay.pairs.length,1,'Explicit archived desktop request must replay successfully');assert.equal(replay.pairs[0].matched,true);assert.equal(replay.errors.length,1);assert.equal(replay.errors[0].viewport,'mobile');
  } finally {await rm(root,{recursive:true,force:true});}
});
