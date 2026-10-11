import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const sourcePin=Object.freeze({commit:'128606e9e744d0b939827b13b9ec9af339e8d95f',tree:'79386e6926c422a81d2fd11a150faefe6513fcb8a89eb15872bc8beeb78d2ee8',model:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d'});
export function validateCausalEnvironment(env,request){
  assert.equal(env.CI,'true','CI only');assert.equal(env.GITHUB_ACTIONS,'true','GitHub Actions only');
  assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab','Exact authorized repository only');
  assert.equal(env.GITHUB_REF,'refs/heads/main','Exact staging branch only');
  assert.equal(env.GITHUB_EVENT_NAME,'push','Exact reviewed push event required');
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/,'Exact harness commit required');
  for(const marker of ['[stage-causal-motion]','[stage-dpr-motion]','[stage-cabin-integration]'])assert.ok((env.R35_DPR_COMMIT_MESSAGE??'').includes(marker),`Missing ${marker}`);
  assert.deepEqual(Object.keys(request??{}).sort(),['allow','contract','exteriorModelSha256','files','sourceSha','sourceTree','version'],'Exact request field set required');
  assert.equal(request?.version,1);assert.equal(request?.allow,true);assert.equal(request?.contract,'r35-causal-observed-effect-v1');
  assert.equal(request.sourceSha,sourcePin.commit);assert.equal(request.sourceTree,sourcePin.tree);assert.equal(request.exteriorModelSha256,sourcePin.model);
  assert.ok(['desktop','mobile'].includes(env.R35_QA_VIEWPORT));
  return {R35_ALLOW_DPR_MOTION_PROBE:'1',R35_DPR_MODE:'fixed',R35_SOURCE_SHA:sourcePin.commit,R35_EXPECTED_APP_TREE:sourcePin.tree,R35_DPR_GEOMETRY_CONTRACT:'contact-shadow-clamp-stability-2m-msaa-v1'};
}
export const requiredCollectorFiles=Object.freeze(["evidence/desktop-original-report.json", "evidence/e9-motion-policy.mjs", "evidence/mobile-original-report.json", "scripts/build-causal-driver.mjs", "scripts/cabin-resource-observer.mjs", "scripts/causal-cabin-model.mjs", "scripts/causal-capture.mjs", "scripts/causal-evidence-replay.mjs", "scripts/causal-motion-observer.mjs", "scripts/causal-motion-preflight.mjs", "scripts/causal-observed-effect-policy.mjs", "scripts/causal-transport-ledger.mjs", "scripts/demand-final-request-policy.mjs", "scripts/diagnose-causal-motion.mjs", "scripts/diagnose-configurator-controls.mjs", "scripts/diagnose-dpr-motion.mjs", "scripts/dpr-motion-observer.mjs", "scripts/dpr-motion-policy.mjs", "scripts/environment-pixel-comparison.mjs", "scripts/functional-capture-readiness.mjs", "scripts/vehicle-preview-readiness.mjs"]);
export async function verifyCollectorFiles(root,request){
  assert.deepEqual(Object.keys(request.files??{}).sort(),requiredCollectorFiles,'Complete exact executable/evidence manifest required');
  for(const [path,digest]of Object.entries(request.files)){
    assert.match(digest??'',/^[a-f0-9]{64}$/,'Exact SHA-256 collector pin required');
    assert.equal(hash(await readFile(resolve(root,path))),digest,`Unreviewed collector file: ${path}`);
  }
}
/** The pinned GLB has only affine translation+scale nodes and accessor bounds.
 * Replay those source bytes independently; reject any unmodeled transform/skinning/morph.
 * This does not read production's prepared scene transform or current camera pose. */
export function independentExteriorTransform(bytes){
  assert.equal(hash(bytes),sourcePin.model,'Independent geometry model must match runtime source model');
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  const j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const roots=j.scenes[j.scene??0].nodes;assert.equal(roots.length,j.nodes.length,'Unmodeled hierarchy');
  for(const node of j.nodes){
    assert.ok(!node.rotation&&!node.matrix&&!node.children&&!node.skin&&!node.weights,'Unmodeled node transform');
    if(node.mesh===undefined)continue;
    const s=node.scale??[1,1,1],t=node.translation??[0,0,0];
    for(const p of j.meshes[node.mesh].primitives){
      assert.ok(!p.targets,'Unmodeled morph geometry');
      const a=j.accessors[p.attributes.POSITION];assert.equal(a.type,'VEC3');assert.ok(a.min?.length===3&&a.max?.length===3);
      const normalize=n=>a.normalized?(a.componentType===5122?Math.max(n/32767,-1):a.componentType===5123?n/65535:assert.fail('Unmodeled normalized accessor')):n;
      for(let i=0;i<3;i++){const endpoints=[normalize(a.min[i])*s[i]+t[i],normalize(a.max[i])*s[i]+t[i]];min[i]=Math.min(min[i],...endpoints);max[i]=Math.max(max[i],...endpoints);}
    }
  }
  const scale=4.7/Math.max(max[0]-min[0],max[2]-min[2]);
  assert.ok(Number.isFinite(scale)&&scale>0);
  return {scale,position:[-(min[0]+max[0])*scale/2,-min[1]*scale,-(min[2]+max[2])*scale/2],nativeBounds:{min,max},derivation:'independent-pinned-GLB-accessor-bounds'};
}
export async function prepareCausalConfig(root,collectorRoot,request,viewport){
  await verifyCollectorFiles(collectorRoot,request);
  const transform=independentExteriorTransform(await readFile(resolve(root,'dist/models/ciasny-r35.glb')));
  const row=(w,h,dpr)=>{const pixelRatio=Math.min(dpr,1.5,Math.sqrt(2e6/(w*h)));return{cssWidth:w,cssHeight:h,renderWidth:w,renderHeight:h,width:Math.floor(w*pixelRatio),height:Math.floor(h*pixelRatio),pixelRatio};};
  return {transform,controllerModelSha256:request.files['scripts/causal-cabin-model.mjs'],maxRecords:32768,
    geometry:viewport==='mobile'?{initial:row(390,372,3),resized:row(430,428,3)}:{initial:row(1440,744,2),resized:row(1280,644,2)}};
}
