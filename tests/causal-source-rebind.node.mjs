import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applicationIdentity} from '../scripts/diagnose-dpr-motion.mjs';
import {hash,sourcePin,validateCausalEnvironment,verifyCollectorFiles} from '../scripts/causal-motion-preflight.mjs';
import {validateMotionEnvironment,motionModelsForSource} from '../scripts/dpr-motion-policy.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url));
const json=async path=>JSON.parse(await read(path));
const commit='dfdb11f3feb55fcaf5819fc93fe9b269165b4463';
const tree='d37a85b85db277453e836dddec2ff0472235aec791a54e1bbdb4124c9eb575b6';
const oldCommit='128606e9e744d0b939827b13b9ec9af339e8d95f';
const oldTree='79386e6926c422a81d2fd11a150faefe6513fcb8a89eb15872bc8beeb78d2ee8';
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),R35_DPR_COMMIT_MESSAGE:'[stage-causal-motion] [stage-dpr-motion] [stage-cabin-integration]',R35_QA_VIEWPORT:'desktop'};

test('Only the known immutable runtime commit and exact reviewed source are eligible',async()=>{
  const request=await json('qa/causal-motion-request.json');
  assert.equal(sourcePin.commit,commit);assert.equal(sourcePin.tree,tree);
  assert.equal(request.sourceSha,commit);assert.equal(request.sourceTree,tree);
  await verifyCollectorFiles(new URL('..',import.meta.url).pathname,request);
  for(const viewport of ['desktop','mobile']){
    const resolved=validateCausalEnvironment({...env,R35_QA_VIEWPORT:viewport},request);
    assert.equal(resolved.R35_SOURCE_SHA,commit);
    assert.equal(resolved.R35_EXPECTED_APP_TREE,tree);
    assert.equal(resolved.R35_DPR_GEOMETRY_CONTRACT,'camera-terminal-orientation-2m-msaa-v1');
    const target=validateMotionEnvironment({...env,R35_QA_VIEWPORT:viewport,...resolved});
    assert.equal(target.geometry.sourceTree,tree);assert.equal(target.geometry.maxBufferPixels,2_000_000);
  }
  for(const sourceSha of ['current','HEAD',oldCommit,'b'.repeat(40)])assert.throws(()=>validateCausalEnvironment(env,{...request,sourceSha}));
  for(const sourceTree of [oldTree,'b'.repeat(64),undefined])assert.throws(()=>validateCausalEnvironment(env,{...request,sourceTree}));
  assert.throws(()=>validateCausalEnvironment(env,{...request,geometryContract:'other'}));
});

test('The complete source changes only the reviewed rig; independent input/model/observation sources remain identical',async()=>{
  const current=await applicationIdentity(new URL('..',import.meta.url).pathname);
  const historical=await json('qa/fixtures/dpr-motion-contact-shadow-identity.json');
  const frozen=await json('qa/fixtures/dpr-motion-camera-orientation-identity.json');
  assert.deepEqual(current,frozen);assert.equal(current.sha256,tree);assert.equal(current.files.length,93);
  assert.equal(historical.sha256,oldTree);
  assert.deepEqual(current.files.map(row=>row.path),historical.files.map(row=>row.path));
  const changed=current.files.filter(row=>historical.files.find(old=>old.path===row.path).sha256!==row.sha256);
  assert.deepEqual(changed,[{path:'src/components/three/CameraRig.tsx',sha256:'219db2403dd0b313cfd1641fc4adc4c9cab2f97c8a8b9cb246441fa653b7b137'}]);
  assert.deepEqual(motionModelsForSource(tree),motionModelsForSource(oldTree));
  for(const[path,digest]of Object.entries({'scripts/causal-cabin-model.mjs':'d2204b1d4e0a5168eed051dd6d964ee7c5dd170fe5cc5448f305c3c894057a16','scripts/causal-evidence-replay.mjs':'e40a4fb14f9ee50e76c2845e5669b0645fdefd6d4dbf10ed15c805ecebee6030','scripts/causal-observed-effect-policy.mjs':'a56c82c76de3f2c5674bf61133fe34e67e511772ceb14c4172d4ca6ecbe2f1a3','scripts/causal-capture.mjs':'d5c72d64ac636cb6de6c8249f52ec266b1385468740fbaaad61765e016045efd','scripts/causal-motion-observer.mjs':'87627dcac02caa8d2bdf9a1068889a2735852ef2896f89e2d2e186391feaaf1d'}))assert.equal(hash(await read(path)),digest,path);
});

test('Published 128606e request and both failed original/causal reports are byte-exact historical evidence',async()=>{
  const prefix='evidence/causal-128606e/';
  const expected={'request.json':'6bc302c90ab05538fa0814b07cb22562c8992a58a5659faa3e174e7b65ea8f17','desktop-original-report.json':'2e62fbac6e170ff19fc52edb931fa9149b3060cc8eb98e2f35517a941f649b6c','desktop-causal-report.json':'c011bd5c470bf7b9a29cecd58d2f51c2d970f0379e7a25e79120a74e26ccc662','mobile-original-report.json':'143d00fdb056dcecf2e00ad48a74a68ff9b040aff661374aedacfce7238f28a9','mobile-causal-report.json':'d8d64b806d49d115f532f56d9426d4701c50224dea1dcc69abcb7818ce66a546'};
  const provenance=await json(prefix+'manifest.json');assert.deepEqual(provenance.files,expected);assert.equal(provenance.runId,38142958548);assert.equal(provenance.sourceCommit,oldCommit);assert.equal(provenance.sourceTree,oldTree);
  for(const[path,digest]of Object.entries(expected))assert.equal(hash(await read(prefix+path)),digest,path);
  const historical=await json(prefix+'request.json');assert.equal(historical.sourceSha,oldCommit);assert.equal(historical.sourceTree,oldTree);assert.throws(()=>validateCausalEnvironment(env,historical));
  for(const viewport of ['desktop','mobile']){
    const original=await json(prefix+viewport+'-original-report.json'),causal=await json(prefix+viewport+'-causal-report.json');
    assert.equal(original.result,'failed');assert.equal(causal.result,'insufficient');assert.equal(causal.originalGate.result,'failed');assert.equal(causal.fullMotionVerdict,'not-established');
    assert.equal(causal.endpoints.filter(e=>e.result==='observed-effect-endpoint-only').length,viewport==='desktop'?7:3);
  }
});

test('QA child checks out the exact runtime separately and runs the new safe rebind test',async()=>{
  const workflow=String(await read('.github/workflows/causal-motion-diagnostic.yml'));
  assert.ok(workflow.includes('ref: ${{ github.sha }}'));
  assert.ok(workflow.includes('ref: ${{ env.R35_SOURCE_SHA }}'));
  assert.ok(workflow.includes('assert.equal(identity.sha256,process.env.R35_EXPECTED_APP_TREE)'));
  assert.ok(workflow.includes('tests/causal-source-rebind.node.mjs'));
  assert.doesNotMatch(workflow,/continue-on-error|npm test|tests\/server/);
});
