/** A new closed material-only contract. Historical preparation/geometry pins remain unchanged. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertComparisonModelReceipt } from './cabin-leather-model-body.mjs';
import { sharedAssetBodies } from './raster-cost-evidence.mjs';
import { assertCabinResourcesReleased } from './cabin-resource-assertions.mjs';
import { budgets, readinessWindow, remainingBudget, sha256, models, acceptedCabinImages, assertCurrentGeometry, assertDesktopFeatureGeometry } from './cabin-preparation-policy.mjs';
export { budgets, readinessWindow, remainingBudget, sha256 };
export const contract = 'r35-cabin-leather-material-comparison-v1';
export const fineRoughnessContract = 'r35-cabin-fine-roughness-comparison-v1';
export const roughnessContract = 'r35-cabin-roughness-control-comparison-v1';
export const roughnessBaselineCommit = 'e546526c9c7be993dce0e9d5dfb1a2b17cd0c373';
export const constantRoughness = 162 / 255 * 0.98;
export const baselineCommit = '4e29206e5844c62c7280e1c889f2f90a56b51add';
export const baselineTree = 'f530e2009115310a5c229d7024d3dc99dcb0d5ff0939d76cba4f9aeb947942c0';
export const previewPath = 'src/components/three/cabinPreview.ts';
export const materialIndices = Object.freeze([0, 10, 13, 32, 34, 35]);
const exactKeys = (value, keys) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort());
export function assertSourcePair(request) {
  exactKeys(request, ['version','allow','contract','baseline','candidate','helperPins']);
  const profile=comparisonProfile(request.contract);
  assert.equal(request.version, 1); assert.equal(typeof request.allow, 'boolean');
  exactKeys(request.baseline,['commit','source','model','buildFiles']);
  assert.equal(request.baseline.commit, profile.baselineCommit); assert.equal(request.baseline.source.sha256, baselineTree);
  for (const lane of [request.baseline, ...(request.candidate ? [request.candidate] : [])]) {
    exactKeys(lane.source,['contract','sha256','files']); assert.equal(lane.source.contract,'r35-production-source-v2-with-index');
    assert.equal(lane.source.files.length,101); assert.equal(sha256(JSON.stringify(lane.source.files)),lane.source.sha256);
    assert.deepEqual(lane.source.files.map(f=>f.path), [...new Set(lane.source.files.map(f=>f.path))].sort());
    for (const f of lane.source.files) { exactKeys(f,['path','sha256']); assert.match(f.sha256,/^[a-f0-9]{64}$/); }
    exactKeys(lane.model,['path','bytes','sha256','gzipBytes','gzipSha256']);
    assert.match(lane.model.path,/^\/models\/r35-cabin-[a-z0-9-]+\.glb$/);
    for (const k of ['sha256','gzipSha256']) assert.match(lane.model[k],/^[a-f0-9]{64}$/);
    for (const k of ['bytes','gzipBytes']) assert.ok(Number.isSafeInteger(lane.model[k]) && lane.model[k]>0);
  }
  assert.deepEqual(request.baseline.model,{...models[0],gzipBytes:10194084,gzipSha256:'efe0ace781740e4b1cec685f02bf6b94eb6654447cccb96cc79769bfd01eee16'});
  if (request.allow) {
    assert.deepEqual(Object.keys(request.helperPins).sort(), [...profile.helperPaths].sort());
    for(const name of ['baseline','candidate']) { assert.ok(request[name]);assert.deepEqual(Object.keys(request[name].buildFiles).sort(), [...profile.buildPaths[name]].sort()); }
    for(const hash of [...Object.values(request.helperPins),...Object.values(request.baseline.buildFiles),...Object.values(request.candidate.buildFiles)])assert.match(hash,/^[a-f0-9]{64}$/);
  }
  if (!request.candidate) { assert.equal(request.allow,false,'An enabled request needs its exact candidate'); return; }
  exactKeys(request.candidate,['commit','source','model','buildFiles']); assert.equal(request.candidate.commit,'current');
  assert.notEqual(request.candidate.model.path,request.baseline.model.path); assert.notEqual(request.candidate.model.sha256,request.baseline.model.sha256);
  const changed=request.baseline.source.files.filter((f,i)=>{assert.equal(f.path,request.candidate.source.files[i].path);return f.sha256!==request.candidate.source.files[i].sha256;});
  assert.deepEqual(changed.map(f=>f.path),[previewPath],'Only the ordinary production cabin URL may differ');
}
export function validateComparisonEnvironment(env, request) {
  assert.equal(env.CI,'true'); assert.equal(env.GITHUB_ACTIONS,'true'); assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');
  assert.equal(env.GITHUB_REF,'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME,'push'); assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
  assert.equal(comparisonRequestPath(env.R35_LEATHER_COMMIT_MESSAGE??''),comparisonProfile(request.contract).requestPath);
  assert.ok(['baseline','candidate'].includes(env.R35_LEATHER_LANE)); assert.ok(['desktop','mobile'].includes(env.R35_QA_VIEWPORT));
  for (const name of Object.keys(env).filter(name=>/^R35_/.test(name))) assert.ok(['R35_LEATHER_COMMIT_MESSAGE','R35_LEATHER_LANE','R35_QA_VIEWPORT'].includes(name),`Unreviewed override ${name}`);
  assertSourcePair(request); assert.equal(request.allow,true,'Comparison request is disabled'); assert.ok(request.candidate);
  const lane=request[env.R35_LEATHER_LANE], mobile=env.R35_QA_VIEWPORT==='mobile';
  return { lane:env.R35_LEATHER_LANE, name:env.R35_QA_VIEWPORT, commit:lane.commit==='current'?env.GITHUB_SHA:lane.commit, expected:lane,
    baseUrl:'http://127.0.0.1:4178', viewport:mobile?{width:390,height:844}:{width:1440,height:900}, deviceScaleFactor:mobile?3:2, isMobile:mobile, hasTouch:mobile };
}
export async function verifyFilePins(root, pins, expectedPaths) {
  if (expectedPaths) assert.deepEqual(Object.keys(pins).sort(), [...expectedPaths].sort(), 'Complete exact file closure required');
  assert.ok(Object.keys(pins).length>0,'Empty file closure is not a pin');
  for (const [path,hash] of Object.entries(pins)) { assert.ok(/^(scripts|qa|tests|\.github)\//.test(path)&&!path.includes('..')); assert.match(hash,/^[a-f0-9]{64}$/); assert.equal(sha256(await readFile(resolve(root,path))),hash,`Exact helper/build pin ${path}`); }
}
export function assertPreviewSelection(text,target,request) {
  const original=request.baseline.source.files.find(f=>f.path===previewPath);
  assert.equal(text.split(target.expected.model.path).length,2,'Exactly one ordinary production URL constant');
  assert.equal(sha256(text.replace(target.expected.model.path,request.baseline.model.path)),original.sha256,'No runtime change beyond the cabin URL');
}
export function inspectMaterialModel(bytes, expected, lane, baselineBytes, treatmentContract=contract) {
  comparisonProfile(treatmentContract);assert.ok(['baseline','candidate'].includes(lane));
  assert.equal(bytes.length,expected.bytes); assert.equal(sha256(bytes),expected.sha256);
  const parse=body=>{assert.equal(body.readUInt32LE(0),0x46546c67);assert.equal(body.readUInt32LE(4),2);assert.equal(body.readUInt32LE(8),body.length);const n=body.readUInt32LE(12);assert.equal(body.readUInt32LE(16),0x4e4f534a);assert.equal(body.readUInt32LE(24+n),0x004e4942);return {json:JSON.parse(body.subarray(20,20+n)),bin:body.subarray(28+n)};};
  const baseline=parse(baselineBytes), current=parse(bytes), images=acceptedCabinImages(baselineBytes);
  assert.equal(images.length,11); assert.equal(current.bin.equals(baseline.bin),true,'All geometry, textures, AO, static faces and embedded bytes are immutable');
  if(treatmentContract===fineRoughnessContract) {
    const before={index:1,texCoord:2},after={index:1,texCoord:2,extensions:{KHR_texture_transform:{scale:[4,4]}}};
    const changes=materialIndices.map(index=>({index,name:baseline.json.materials[index].name,metallicRoughnessTexture:{before,after}}));
    assert.deepEqual(current.json.extensionsUsed,lane==='candidate'?[...baseline.json.extensionsUsed,'KHR_texture_transform']:baseline.json.extensionsUsed);
    current.json.extensionsUsed=baseline.json.extensionsUsed;
    for(const {index} of changes) {
      const m=current.json.materials[index],original=baseline.json.materials[index];
      assert.equal(original.normalTexture.scale,.55);assert.equal(m.normalTexture.scale,.55);
      assert.equal(original.pbrMetallicRoughness.roughnessFactor,.98);assert.equal(m.pbrMetallicRoughness.roughnessFactor,.98);
      assert.equal(original.pbrMetallicRoughness.metallicFactor,0);assert.equal(m.pbrMetallicRoughness.metallicFactor,0);
      assert.deepEqual(original.pbrMetallicRoughness.metallicRoughnessTexture,before);
      assert.deepEqual(m.pbrMetallicRoughness.metallicRoughnessTexture,lane==='candidate'?after:before);
      m.pbrMetallicRoughness.metallicRoughnessTexture=original.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    assert.deepEqual(current.json,baseline.json,'Only six red ORM scale[4,4] transforms and their extension declaration may differ');
    return {images,changes:lane==='candidate'?changes:[],binarySha256:sha256(current.bin),normalizedDocumentSha256:sha256(JSON.stringify(current.json))};
  }
  if(treatmentContract===roughnessContract) {
    const changes=materialIndices.map(index=>({index,name:baseline.json.materials[index].name,roughnessFactor:{before:.98,after:constantRoughness},metallicRoughnessTexture:{before:{index:1,texCoord:2},after:null}}));
    for(const {index} of changes) {
      const m=current.json.materials[index], original=baseline.json.materials[index];
      assert.equal(original.normalTexture.scale,.55);assert.equal(m.normalTexture.scale,.55);
      assert.equal(original.pbrMetallicRoughness.metallicFactor,0);assert.equal(m.pbrMetallicRoughness.metallicFactor,0);
      assert.equal(original.pbrMetallicRoughness.roughnessFactor,.98);assert.deepEqual(original.pbrMetallicRoughness.metallicRoughnessTexture,{index:1,texCoord:2});
      assert.equal(m.pbrMetallicRoughness.roughnessFactor,lane==='candidate'?constantRoughness:.98);
      if(lane==='candidate')assert.equal(Object.hasOwn(m.pbrMetallicRoughness,'metallicRoughnessTexture'),false);
      else assert.deepEqual(m.pbrMetallicRoughness.metallicRoughnessTexture,original.pbrMetallicRoughness.metallicRoughnessTexture);
      // Restore the original property order as well as values for a stable normalized document hash.
      const normalized={...m,pbrMetallicRoughness:original.pbrMetallicRoughness};
      assert.deepEqual({...m.pbrMetallicRoughness,roughnessFactor:.98,metallicRoughnessTexture:original.pbrMetallicRoughness.metallicRoughnessTexture},original.pbrMetallicRoughness);
      current.json.materials[index]=normalized;
    }
    assert.deepEqual(current.json,baseline.json,'Only the six fixed roughness factors and their shared ORM references may differ');
    return {images,changes:lane==='candidate'?changes:[],binarySha256:sha256(current.bin),normalizedDocumentSha256:sha256(JSON.stringify(current.json))};
  }
  const changes=materialIndices.map(index=>({index,name:baseline.json.materials[index].name,before:0.55,after:0.35}));
  for(const {index} of changes) { const m=current.json.materials[index], original=baseline.json.materials[index]; assert.equal(original.normalTexture.scale,.55);assert.equal(m.normalTexture.scale,lane==='candidate'?.35:.55);assert.equal(m.pbrMetallicRoughness.roughnessFactor,.98);m.normalTexture.scale=.55; }
  assert.deepEqual(current.json,baseline.json,'Exactly six Red Amber normal-strength scalars may differ');
  return {images,changes:lane==='candidate'?changes:[],binarySha256:sha256(current.bin),normalizedDocumentSha256:sha256(JSON.stringify(current.json))};
}
export function assertNativeCertificate(certificate, observation, target, seat) {
  assert.deepEqual(observation.issues,[]); assert.equal(certificate.reusedUnchanged,false);
  for (const key of ['owner','mainDrawId','fenceId','drainFenceId']) assert.ok(Number.isSafeInteger(certificate[key])&&certificate[key]>0);
  for (const key of ['nativeStatus','drainNativeStatus']) assert.ok([0x911a,0x911c].includes(certificate[key]));
  assertCurrentGeometry(certificate.snapshot,'standard',target.deviceScaleFactor);
  if(target.name==='desktop')assertDesktopFeatureGeometry(certificate.snapshot,'standard');
  const s=certificate.snapshot; assert.equal(s.live,true); assert.equal(s.camera.settled,true);assert.equal(s.vehicle.environment,'studio');assert.equal(s.vehicle.environmentRequest,0);assert.equal(s.vehicle.lights,false);assert.equal(s.vehicle.cabinSeat,seat);
  assert.equal(s.vehicle.exterior,true);assert.equal(s.vehicle.full,seat!==null);if(seat)assert.equal(s.vehicle.proxy,false);
  const events=observation.events.filter(e=>e.owner===certificate.owner);
  const main=events.find(e=>e.kind==='main'&&e.id===certificate.mainDrawId);assert.ok(main?.stable);assert.deepEqual(main.snapshot,s);
  const fence=events.find(e=>e.kind==='fence'&&e.id===certificate.fenceId&&e.draws.includes(main.id)&&e.at>=main.at);assert.ok(fence);
  const wait=events.find(e=>e.kind==='wait'&&e.id===fence.id&&e.status===certificate.nativeStatus&&e.at>=fence.at&&e.at<=certificate.readyAt);assert.ok(wait);
  const drain=events.find(e=>e.kind==='fence'&&e.id===certificate.drainFenceId);assert.ok(drain);
  assert.ok(events.some(e=>e.kind==='wait'&&e.id===drain.id&&e.status===certificate.drainNativeStatus&&e.at>=wait.at&&e.at<=certificate.readyAt));
  assert.equal(events.some(e=>['invalid','stop','buffer-replaced'].includes(e.kind)&&e.at>=main.at&&e.at<=certificate.readyAt),false);
}
export function assertMatchedPair(baseline,candidate,request) {
  assertSourcePair(request); assert.equal(request.allow,true);
  for(const [name,row] of [['baseline',baseline],['candidate',candidate]]) { assert.equal(row.result,'passed');assert.equal(row.lane,name);assert.equal(row.contract,request.contract);assert.deepEqual(row.source,request[name].source);assert.deepEqual(row.model,request[name].model);assert.deepEqual(row.budgets,budgets);assert.equal(row.quality,'standard');assert.ok(['desktop','mobile'].includes(row.viewport));assert.deepEqual(row.settings,comparisonSettings(row.viewport));assert.equal(row.resourceRetirement.closedBitmapIds.length,11);assert.equal(row.material.images.length,11);assert.deepEqual(row.errors,[]);assert.deepEqual(row.pageErrors,[]);assert.deepEqual(row.console,[]); assert.deepEqual(row.cleanup,{receipts:'passed',context:'closed',browser:'closed',server:'closed'}); assert.equal(row.sourceCommit,name==='baseline'?request.baseline.commit:row.harnessCommit); assert.equal(row.runtimeBodyLedger.state,'finished');assert.deepEqual(row.runtimeBodyLedger.errors,[]);assert.deepEqual(row.runtimeBodyLedger.lateEvents,[]);assert.deepEqual(assertCabinResourcesReleased(row.residentCohort,row.resources),row.resourceRetirement);const modelBodies=row.runtimeBodyLedger.requests.filter(r=>r.path===row.model.path);assert.equal(modelBodies.length,1);assert.equal(modelBodies[0].sha256,row.model.sha256);assert.equal(modelBodies[0].bytes,row.model.bytes);assert.equal(modelBodies[0].state,'body-completed');assertComparisonModelReceipt(row.nativeModelReceipt,row.model,row.runtimeBodyLedger.requests); }
  assert.deepEqual(baseline.material.changes,[]);
  if(request.contract===fineRoughnessContract)assert.deepEqual(candidate.material.changes.map(({index,metallicRoughnessTexture})=>({index,metallicRoughnessTexture})),materialIndices.map(index=>({index,metallicRoughnessTexture:{before:{index:1,texCoord:2},after:{index:1,texCoord:2,extensions:{KHR_texture_transform:{scale:[4,4]}}}}})));
  else if(request.contract===roughnessContract)assert.deepEqual(candidate.material.changes.map(({index,roughnessFactor,metallicRoughnessTexture})=>({index,roughnessFactor,metallicRoughnessTexture})),materialIndices.map(index=>({index,roughnessFactor:{before:.98,after:constantRoughness},metallicRoughnessTexture:{before:{index:1,texCoord:2},after:null}})));
  else assert.deepEqual(candidate.material.changes.map(({index,before,after})=>({index,before,after})),materialIndices.map(index=>({index,before:.55,after:.35})));
  const shared=row=>sharedAssetBodies(row.runtimeBodyLedger.requests.filter(body=>body.path!==row.model.path)).sort((a,b)=>a.path.localeCompare(b.path));
  assert.deepEqual(shared(baseline),shared(candidate),'All actually requested CSS/fonts/exterior/proxy/environment/surface bodies must match');
  assert.equal(baseline.harnessCommit,candidate.harnessCommit);assert.equal(baseline.viewport,candidate.viewport);assert.deepEqual(baseline.settings,candidate.settings);assert.deepEqual(baseline.material.images,candidate.material.images);assert.equal(baseline.material.binarySha256,candidate.material.binarySha256);assert.equal(baseline.material.normalizedDocumentSha256,candidate.material.normalizedDocumentSha256);
  const pairs=[];
  for(const seat of ['driver','passenger']) { const a=baseline.captures.find(c=>c.label===seat),b=candidate.captures.find(c=>c.label===seat);assert.ok(a&&b);for(const capture of [a,b]){assert.match(capture.renderer.renderer,/SwiftShader/i);assert.equal(capture.renderer.antialias,true);assert.ok(capture.renderer.samples>=2&&capture.renderer.sampleBuffers>=1);}assertNativeCertificate(a.certificate,baseline.observation,baseline.settings,seat);assertNativeCertificate(b.certificate,candidate.observation,candidate.settings,seat);assert.deepEqual(a.certificate.snapshot,b.certificate.snapshot,'Entire completed scene/camera snapshot must match');assert.deepEqual(a.bounds,b.bounds);assert.deepEqual(a.renderer,b.renderer);pairs.push({seat,baseline:a.file,candidate:b.file,baselineSha256:a.sha256,candidateSha256:b.sha256}); }
  const result={viewport:baseline.viewport,matched:true,pairs,scope:'Matched functional software-WebGL material comparison. Visual judgment remains human; no performance or physical-device claim.'};
  if(request.contract===roughnessContract||request.contract===fineRoughnessContract) {
    const counts=[baseline,candidate].map(row=>{
      const owner=row.captures.find(c=>c.label==='driver').certificate.owner;
      const contexts=row.observation.contexts.filter(c=>c.owner===owner);assert.equal(contexts.length,1,'One observed scene owner context');
      const programs=row.observation.resources.filter(r=>r.kind==='program'&&r.contextId===contexts[0].id);
      assert.ok(programs.length>0,'Actual scene program allocation observations required');
      for(const program of programs){assert.equal(program.deleted,1);assert.equal(program.deletedLive,true);}
      return {textures:row.residentCohort.textureIds.length,programs:programs.length};
    });
    const delta=key=>({baseline:counts[0][key],candidate:counts[1][key],delta:counts[1][key]-counts[0][key]});
    result.nativeAllocations={residentCabinWebGLTextures:delta('textures'),sceneWebGLProgramAllocations:delta('programs'),scope:'Existing native observer allocations across the collected scene lifecycle; not Three.js Texture objects or per-material shader defines. No performance claim.'};
  }
  return result;
}

export const helperPaths = Object.freeze([
  ".github/workflows/cabin-leather-comparison.yml",
  "scripts/cabin-capture-readiness.mjs",
  "scripts/cabin-leather-comparison-policy.mjs",
  "scripts/cabin-leather-model-body.mjs",
  "scripts/cabin-preparation-checkpoint.mjs",
  "scripts/cabin-preparation-network.mjs",
  "scripts/cabin-preparation-observer.mjs",
  "scripts/cabin-preparation-policy.mjs",
  "scripts/cabin-preparation-readiness.generated.mjs",
  "scripts/cabin-resource-assertions.mjs",
  "scripts/cabin-resource-observer.mjs",
  "scripts/cabin-runtime-body-ledger.mjs",
  "scripts/causal-cabin-model.mjs",
  "scripts/causal-motion-preflight.mjs",
  "scripts/collect-cabin-leather-comparison.mjs",
  "scripts/diagnose-configurator-controls.mjs",
  "scripts/diagnose-dpr-motion.mjs",
  "scripts/diagnose-render-backpressure-lifecycle.mjs",
  "scripts/dpr-motion-observer.mjs",
  "scripts/dpr-motion-policy.mjs",
  "scripts/environment-pixel-comparison.mjs",
  "scripts/functional-capture-readiness.mjs",
  "scripts/raster-cost-evidence.mjs",
  "scripts/render-backpressure-lifecycle-fixture.mjs",
  "scripts/vehicle-preview-readiness.mjs",
  "scripts/verify-cabin-leather-pairs.mjs",
  "tests/cabin-leather-comparison.node.mjs"
]);
export const buildPaths = Object.freeze({baseline:Object.freeze(["scripts/prepare-models.mjs", "scripts/prepare-cabin.mjs", "scripts/prepare-films.mjs", "scripts/fetch-environments.mjs", "scripts/fetch-surfaces.mjs", "scripts/fetch-roadside.mjs", "qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz"]),candidate:Object.freeze(["scripts/prepare-models.mjs", "scripts/prepare-cabin.mjs", "scripts/prepare-films.mjs", "scripts/fetch-environments.mjs", "scripts/fetch-surfaces.mjs", "scripts/fetch-roadside.mjs", "qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz", "qa/cabin-preview/r35-cabin-contact-ao-static-faces-leather.glb.gz"])});

export function comparisonSettings(name) { assert.ok(['desktop','mobile'].includes(name)); const mobile=name==='mobile';return {name,viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:mobile?3:2,isMobile:mobile,hasTouch:mobile,reducedMotion:'no-preference',quality:'standard',maxBufferPixels:2000000,requestedAntialias:true,environment:'studio',lights:false,exposure:1}; }

// Legacy exports and request semantics remain fixed for historical raw-report replay.
const roughnessBuildPaths=Object.freeze({baseline:buildPaths.baseline,candidate:Object.freeze([...buildPaths.baseline,'qa/cabin-preview/r35-contact-ao-static-faces-roughness-control.glb.gz'])});
const roughnessHelperPaths=Object.freeze([...helperPaths,'tests/cabin-roughness-comparison.node.mjs']);
const fineRoughnessBuildPaths=Object.freeze({baseline:buildPaths.baseline,candidate:Object.freeze([...roughnessBuildPaths.candidate,'qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz'])});
const fineRoughnessHelperPaths=Object.freeze([...roughnessHelperPaths,'tests/cabin-fine-roughness-comparison.node.mjs']);
export function comparisonProfile(treatmentContract) {
  assert.ok([contract,roughnessContract,fineRoughnessContract].includes(treatmentContract),'Unknown material comparison contract');
  if(treatmentContract===fineRoughnessContract)return {contract:fineRoughnessContract,baselineCommit:roughnessBaselineCommit,marker:'[stage-cabin-fine-roughness-comparison]',requestPath:'qa/cabin-fine-roughness-comparison-request.json',buildPaths:fineRoughnessBuildPaths,helperPaths:fineRoughnessHelperPaths};
  return treatmentContract===roughnessContract
    ? {contract:roughnessContract,baselineCommit:roughnessBaselineCommit,marker:'[stage-cabin-roughness-comparison]',requestPath:'qa/cabin-roughness-comparison-request.json',buildPaths:roughnessBuildPaths,helperPaths:roughnessHelperPaths}
    : {contract,baselineCommit,marker:'[stage-cabin-leather-comparison]',requestPath:'qa/cabin-leather-comparison-request.json',buildPaths,helperPaths};
}
export function comparisonRequestPath(message) {
  const profiles=[contract,roughnessContract,fineRoughnessContract].map(comparisonProfile).filter(profile=>message.includes(profile.marker));
  assert.equal(profiles.length,1,'Exactly one reviewed material comparison marker required');
  return profiles[0].requestPath;
}
