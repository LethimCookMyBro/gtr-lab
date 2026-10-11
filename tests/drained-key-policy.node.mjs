import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {sourcePin,modelPins,sourceContracts,limits,validateDrainedKeyEnvironment,resolveDrainedKeyRequest,assessDrainedKeyObservation} from '../scripts/drained-key-policy.mjs';
import {main} from '../scripts/diagnose-drained-key.mjs';
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),R35_DRAINED_KEY_COMMIT_MESSAGE:'[stage-drained-key]',R35_ALLOW_DRAINED_KEY:'1',R35_DRAINED_KEY_SOURCE_SHA:sourcePin.sha,R35_DRAINED_KEY_SOURCE_TREE:sourcePin.tree});
const obs=()=>({version:2,stopped:true,stopReason:'scenario-ended',issues:[],contexts:[{id:1,sceneCanvas:true}],keys:[1,2,3].map(index=>({index,keydowns:[{isTrusted:true,repeat:false,focused:true}]})),frames:[1,2,3].map(id=>({id,keyIndex:id,phase:`key-${id}`,status:'signaled',callbackReturned:true,deleted:true,bufferWidth:1967,bufferHeight:1016})),checkpoints:[{id:1,status:'signaled',deleted:true,stale:true}]});
test('CI gate rejects before imports, browser, server or arbitrary-target access',async()=>{await assert.rejects(main({}),/CI-only/);assert.equal(validateDrainedKeyEnvironment(env()).baseUrl,'http://127.0.0.1:4178');for(const [key,value]of Object.entries({GITHUB_ACTIONS:'false',GITHUB_REPOSITORY:'fork/repo',GITHUB_REF:'refs/heads/dev',GITHUB_EVENT_NAME:'workflow_dispatch',R35_ALLOW_DRAINED_KEY:'0',R35_DRAINED_KEY_SOURCE_SHA:'main',R35_DRAINED_KEY_SOURCE_TREE:'a'.repeat(64),R35_DRAINED_KEY_BASE_URL:'https://example.com',DEBUG:'pw:protocol',PLAYWRIGHT_LEGACY_SCREENSHOT:'1'}))assert.throws(()=>validateDrainedKeyEnvironment({...env(),[key]:value}));});
test('request pins immutable source with no expandable limits',()=>{const req={version:1,allow:true,sourceSha:sourcePin.sha,sourceTree:sourcePin.tree};assert.equal(resolveDrainedKeyRequest(req,env()).R35_DRAINED_KEY_SOURCE_SHA,sourcePin.sha);for(const r of [{...req,allow:false},{...req,timeout:999999},{...req,sourceSha:'latest'}])assert.throws(()=>resolveDrainedKeyRequest(r,env()));assert.deepEqual([limits.initialGateMs,limits.keyInputMs,limits.keyGateMs,limits.screenshotMs,limits.observerMs,limits.keys,limits.maxCheckpointsPerGate],[45000,5000,30000,45000,300000,3,4]);});
test('assessment separates checkpoint history and actual frames, allowing historical staleness after a later input',()=>{const a=assessDrainedKeyObservation(obs());assert.equal(a.status,'collected');assert.equal(a.actualDrawRafs,3);assert.equal(a.checkpoints,1);assert.equal(a.originalAcceptanceChanged,false);});
test('missing native event, censorship, loss, pixel change and cleanup failure are incomplete',()=>{for(const mutate of [o=>o.keys.pop(),o=>o.frames.pop(),o=>o.keys[0].keydowns[0].isTrusted=false,o=>o.keys[0].keydowns[0].repeat=true,o=>o.frames[0].status='censored',o=>o.checkpoints[0].status='pending',o=>o.frames[0].deleted=false,o=>o.contexts[0].nativeContextLost=true,o=>o.frames[0].bufferWidth=1391]){const o=obs();mutate(o);assert.equal(assessDrainedKeyObservation(o).status,'incomplete');}});
test('driver has only three native-key calls through fixed loop, no drag/state forcing and one original-deadline screenshot',async()=>{const s=await readFile(new URL('../scripts/diagnose-drained-key.mjs',import.meta.url),'utf8');assert(s.indexOf('validateDrainedKeyEnvironment(env)')<s.indexOf('await import('));assert.equal((s.match(/page\.screenshot\(/g)||[]).length,1);assert.match(s,/timeout:45000,scale:'css',animations:'allow'/);assert.match(s,/index<=limits.keys/);assert.match(s,/page\.keyboard\.press\('ArrowRight'\)/);assert.doesNotMatch(s,/page\.mouse\.|readPixels|\.finish\(|\.flush\(|setDpr|setFrameloop|\.advance\(|captureWithTimeoutRetry/);assert(s.indexOf('await canvas.focus()')<s.indexOf("cleanGate=await gate('initial')"));assert.match(s,/report\.gates\.length!==4/);assert.match(s,/originalAcceptanceChanged: false/);});
test('single-lane workflow resolves source before setup and leaves every prior acceptance file out of scope',async()=>{const w=await readFile(new URL('../.github/workflows/drained-key-diagnostic.yml',import.meta.url),'utf8');const request=JSON.parse(await readFile(new URL('../qa/drained-key-request.json',import.meta.url),'utf8'));resolveDrainedKeyRequest(request,env());assert.match(w,/\[stage-drained-key\]/);assert(w.indexOf('resolveDrainedKeyRequest(request,process.env)')<w.indexOf('path: candidate'));assert.match(w,/diagnose-drained-key\.mjs/);assert.match(w,/timeout --signal=TERM --kill-after=10s 360s/);assert.doesNotMatch(w,/workflow_dispatch:|matrix:|deploy|tests\/server\.test|dpr-motion-request|gpu-frame-request/);});
test('closed contracts preserve original source and bind the brake candidate to exact model bytes',()=>{
 assert.equal(sourceContracts.length,2);
 const [baseline,brake]=sourceContracts;
 assert.deepEqual(sourcePin,{sha:'8db06c2f96e9fedcd8ce7d198d3212048e08620c',tree:'6353f4929c3c9ef3387a0cedfa43d53e685d08592ca43a307304eac1e76a4261'});
 assert.equal(baseline.source,sourcePin);assert.equal(baseline.models,modelPins);
 assert.deepEqual(baseline.models[0],{path:'/models/ciasny-r35.glb',bytes:8296356,sha256:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d'});
 assert.deepEqual(brake.source,{sha:'d92831ad04b4562ca1167b1c6499e22295db0d81',tree:'6bdc7f056b9a0a58f37271423b020e4930b987ea43764620d95dd5bd2440795e'});
 assert.deepEqual(brake.models[0],{path:'/models/ciasny-r35-brake-index-e9425289.glb',bytes:8566388,sha256:'e942528980753f9dea6218bdf50ab943b13974b288faf2fd2305984b600fb1c9'});
 assert.deepEqual(brake.models[1],baseline.models[1]);assert.equal(brake.models.length,2);
 for(const contract of sourceContracts){
  assert(Object.isFrozen(contract)&&Object.isFrozen(contract.source)&&Object.isFrozen(contract.models));
  for(const model of contract.models)assert(Object.isFrozen(model));
  const request={version:1,allow:true,sourceSha:contract.source.sha,sourceTree:contract.source.tree};
  const resolved=resolveDrainedKeyRequest(request,env());assert.equal(validateDrainedKeyEnvironment({...env(),...resolved}).contract,contract);
 }
 assert(Object.isFrozen(sourceContracts));
 for(const [sha,tree]of [[baseline.source.sha,brake.source.tree],[brake.source.sha,baseline.source.tree],['b'.repeat(40),brake.source.tree],[brake.source.sha,'b'.repeat(64)]])assert.throws(()=>validateDrainedKeyEnvironment({...env(),R35_DRAINED_KEY_SOURCE_SHA:sha,R35_DRAINED_KEY_SOURCE_TREE:tree}));
 for(const extra of [{contract:'unreviewed'},{modelPins:brake.models},{limits:{screenshotMs:999999}}])assert.throws(()=>resolveDrainedKeyRequest({version:1,allow:true,sourceSha:brake.source.sha,sourceTree:brake.source.tree,...extra},env()));
});
test('driver takes all build/runtime model expectations only from the selected immutable contract',async()=>{
 const s=await readFile(new URL('../scripts/diagnose-drained-key.mjs',import.meta.url),'utf8');
 assert.match(s,/const modelPins = target\.contract\.models/);
 assert.match(s,/sourceContract: target\.contract\.id/);
 assert.match(s,/models: modelPins/);
 assert.match(s,/for \(const model of modelPins\)/);
 assert.match(s,/modelPins\.find\(m => m\.path === row\.path\)/);
 assert.match(s,/modelPins\.map\(m=>m\.path\)/);
 assert.doesNotMatch(s,/assessDrainedKeyObservation, modelPins, limits/);
});
test('observer, gates, their tests and workflow retain reviewed baseline bytes',async()=>{
 const pins={
  'scripts/drained-key-observer.mjs':'47d1d82eb315a5e338f2dfdd90d193e7191d1fcf62ca585faae8848fe55b8cc0',
  'scripts/drained-key-gates.mjs':'86b7b37fa9ea40cbe5aae73b6c74d67439423345fca335b2324b70332a04068d',
  'tests/drained-key-observer.node.mjs':'dca46b5779d0a37c7de3951da693de3ca96e57ebe2c859b817aa9f8186f1d88b',
  'tests/drained-key-gates.node.mjs':'c2d2f21d7a37ca15d3f6e0f91e6b8ad06d24d8cbca991eaad7da5c3b1febdcd9',
  '.github/workflows/drained-key-diagnostic.yml':'4ca8f77c4268876e9f68212c0ff0a5c364df00aebaed895943ddf3279664fad6',
 };
 for(const [path,sha]of Object.entries(pins))assert.equal(createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex'),sha,path);
});
