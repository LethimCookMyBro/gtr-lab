import assert from 'node:assert/strict';
export const sourcePin = Object.freeze({sha:'8db06c2f96e9fedcd8ce7d198d3212048e08620c',tree:'6353f4929c3c9ef3387a0cedfa43d53e685d08592ca43a307304eac1e76a4261'});
export const limits = Object.freeze({readinessMs:90_000,initialGateMs:45_000,keyInputMs:5_000,keyGateMs:30_000,screenshotMs:45_000,commandMs:5_000,cleanupMs:5_000,observerMs:300_000,maxCheckpointsPerGate:4,keys:3});
export const modelPins = Object.freeze([
 Object.freeze({path:'/models/ciasny-r35.glb',bytes:8_296_356,sha256:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d'}),
 Object.freeze({path:'/models/r35-exterior-cabin-proxy-49d7c2ab.glb',bytes:956_368,sha256:'49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347'}),
]);
// Closed allowlist: only reviewed source pairs can select their immutable runtime model pins.
// The original request remains valid and reproduces the original 8db06c2 contract.
export const sourceContracts = Object.freeze([
 Object.freeze({id:'studio-2m-original-brakes',source:sourcePin,models:modelPins}),
 Object.freeze({id:'studio-2m-brake-index-e9425289',
  source:Object.freeze({sha:'d92831ad04b4562ca1167b1c6499e22295db0d81',tree:'6bdc7f056b9a0a58f37271423b020e4930b987ea43764620d95dd5bd2440795e'}),
  models:Object.freeze([
   Object.freeze({path:'/models/ciasny-r35-brake-index-e9425289.glb',bytes:8_566_388,sha256:'e942528980753f9dea6218bdf50ab943b13974b288faf2fd2305984b600fb1c9'}),
   modelPins[1],
  ]),
 }),
]);
export function validateDrainedKeyEnvironment(env){
 assert.equal(env.GITHUB_ACTIONS,'true','Drained-key diagnostic is CI-only');assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 assert((env.R35_DRAINED_KEY_COMMIT_MESSAGE??'').includes('[stage-drained-key]'));assert.equal(env.R35_ALLOW_DRAINED_KEY,'1');
 const contract=sourceContracts.find(contract=>contract.source.sha===env.R35_DRAINED_KEY_SOURCE_SHA);
 assert(contract,'Unreviewed source commit forbidden');assert.equal(env.R35_DRAINED_KEY_SOURCE_TREE,contract.source.tree,'Exact source-contract pair required');assert.equal(env.R35_DRAINED_KEY_BASE_URL,undefined,'Arbitrary/public target forbidden');
 for(const key of ['DEBUG','DEBUG_FILE','PLAYWRIGHT_LEGACY_SCREENSHOT'])assert.equal(env[key],undefined);
 return {baseUrl:'http://127.0.0.1:4178',viewport:{width:1440,height:900},deviceScaleFactor:2,contract};
}
export function resolveDrainedKeyRequest(request,env){
 assert.deepEqual(Object.keys(request).sort(),['allow','sourceSha','sourceTree','version']);assert.equal(request.version,1);assert.equal(request.allow,true);
 const values={R35_ALLOW_DRAINED_KEY:'1',R35_DRAINED_KEY_SOURCE_SHA:request.sourceSha,R35_DRAINED_KEY_SOURCE_TREE:request.sourceTree};validateDrainedKeyEnvironment({...env,...values});return values;
}
export function assessDrainedKeyObservation(o){
 const failures=[...(o?.issues??['Missing observer'])];
 if(o?.version!==2||!o.stopped||o.stopReason!=='scenario-ended')failures.push('Final observer not cleanly stopped');
 const contexts=o?.contexts??[];if(contexts.filter(c=>c.sceneCanvas).length!==1||contexts.some(c=>c.nativeContextLost||c.lostEvents||c.restoredEvents))failures.push('Healthy single scene context required');
 if(o?.keys?.length!==3)failures.push('Three native-key epochs required');
 for(const k of o?.keys??[])if(k.keydowns.length!==1||!k.keydowns[0].isTrusted||k.keydowns[0].repeat||!k.keydowns[0].focused)failures.push(`Key ${k.index} lacks one trusted focused native event`);
 for(const k of o?.keys??[])if(!(o?.frames??[]).some(f=>f.keyIndex===k.index))failures.push(`Key ${k.index} lacks an actual draw RAF`);
 for(const f of o?.frames??[])if(f.status!=='signaled'||!f.callbackReturned||!f.deleted)failures.push(`Draw RAF ${f.id} incomplete`);
 for(const cp of o?.checkpoints??[])if(cp.status!=='signaled'||!cp.deleted)failures.push(`Checkpoint ${cp.id} incomplete`);
 if((o?.frames??[]).some(f=>f.phase!=='loading'&&(f.bufferWidth!==1967||f.bufferHeight!==1016)))failures.push('Stable pixel geometry differs from unchanged 2M baseline');
 return {status:failures.length?'incomplete':'collected',originalAcceptanceChanged:false,failures,actualDrawRafs:o?.frames?.length??0,checkpoints:o?.checkpoints?.length??0,limits:'Checkpoint fences are not app draw frames. No FPS, pure GPU time or original drag-acceptance pass is inferred.'};
}
