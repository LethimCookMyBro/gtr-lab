/** Separate exact-source selector-support-topology contract; no historical pin widening. */
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {budgets,readinessWindow,remainingBudget,sha256,assertNativeCertificate,assertPreviewSelection,comparisonSettings} from './cabin-leather-comparison-policy.mjs';
import {assertComparisonModelReceipt} from './cabin-leather-model-body.mjs';
import {assertCabinResourcesReleased} from './cabin-resource-assertions.mjs';
import {sharedAssetBodies} from './raster-cost-evidence.mjs';
import {assertRestoredExteriorPose} from './cabin-preparation-policy.mjs';
import {createCabinOracle} from './causal-cabin-model.mjs';
import {assertCloseupCapture} from './cabin-shifter-closeup.mjs';
import {baselineTree,buildPaths,helperPaths} from './cabin-selector-topology-closure.mjs';
export {budgets,readinessWindow,remainingBudget,sha256,assertNativeCertificate,assertPreviewSelection,comparisonSettings,buildPaths,helperPaths,baselineTree};
export const contract='r35-cabin-selector-topology-comparison-v1';
export {closureState} from './cabin-selector-topology-closure.mjs';
import {closureState,frozenCandidate,baselineBuildFiles} from './cabin-selector-topology-closure.mjs';
import {assertCloseupFromDriver} from './cabin-selector-topology-path.mjs';
export const baselineCommit='28f586ce35b4441254c10583fc7bc1da3265a106';
export const previewPath='src/components/three/cabinPreview.ts';
export const marker='[stage-cabin-selector-topology-comparison]';
export const requestPath='qa/cabin-selector-topology-request.json';
export const baselineModel=Object.freeze({path:'/models/r35-cabin-fine-roughness-ed88ad0e.glb',bytes:20196108,sha256:'ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0',gzipBytes:10194113,gzipSha256:'b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5'});
export const candidateModel=frozenCandidate?.model??null;
const keys=(value,expected)=>assert.deepEqual(Object.keys(value??{}).sort(),[...expected].sort());
const hash=value=>assert.match(value??'',/^[a-f0-9]{64}$/);
export function comparisonProfile(value) {assert.equal(value,contract);return {contract,baselineCommit,marker,requestPath,buildPaths,helperPaths};}
export function comparisonRequestPath(message) {assert.deepEqual(message.match(/\[(?:stage|release)-[^\]]+\]/g),[marker],'Exactly the closed selector-topology marker is required');return requestPath;}
export function assertSourcePair(request) {
 assert.equal(closureState,'frozen','Selector topology pin closure is pending; no executable candidate');
 assert.ok(frozenCandidate,'Frozen exact candidate identity required');
 keys(request,['version','allow','contract','baseline','candidate','helperPins']);assert.equal(request.version,1);assert.equal(typeof request.allow,'boolean');assert.equal(request.contract,contract);
 assert.deepEqual(request.baseline.buildFiles,baselineBuildFiles,'Exact immutable baseline build inputs');assert.equal(request.baseline.commit,baselineCommit);assert.equal(request.baseline.source.sha256,baselineTree);assert.deepEqual(request.baseline.model,baselineModel);
 keys(request.helperPins,helperPaths);Object.values(request.helperPins).forEach(hash);
 for(const name of ['baseline','candidate']){const lane=request[name];assert.ok(lane,'Both immutable lane identities required even while disabled');keys(lane,['commit','source','model','buildFiles']);keys(lane.source,['contract','sha256','files']);assert.equal(lane.source.contract,'r35-production-source-v2-with-index');assert.equal(lane.source.files.length,101);assert.equal(sha256(JSON.stringify(lane.source.files)),lane.source.sha256);assert.deepEqual(lane.source.files.map(f=>f.path),[...new Set(lane.source.files.map(f=>f.path))].sort());for(const f of lane.source.files){keys(f,['path','sha256']);hash(f.sha256);}
 keys(lane.model,['path','bytes','sha256','gzipBytes','gzipSha256']);for(const field of ['sha256','gzipSha256'])hash(lane.model[field]);for(const field of ['bytes','gzipBytes'])assert.ok(Number.isSafeInteger(lane.model[field])&&lane.model[field]>0);keys(lane.buildFiles,buildPaths[name]);Object.values(lane.buildFiles).forEach(hash);}
 assert.deepEqual(request.candidate.model,candidateModel,'Only the frozen reviewed topology candidate is admitted');assert.equal(request.candidate.source.sha256,frozenCandidate.sourceSha256);assert.deepEqual(request.candidate.buildFiles,frozenCandidate.buildFiles);assert.equal(request.candidate.commit,'current');assert.match(request.candidate.model.path,/^\/models\/r35-cabin-selector-topology-[a-f0-9]{8}\.glb$/);assert.equal(request.candidate.model.path.split('-').at(-1).slice(0,8),request.candidate.model.sha256.slice(0,8));assert.notEqual(request.candidate.model.sha256,baselineModel.sha256);
 const changed=request.baseline.source.files.filter((f,i)=>{assert.equal(f.path,request.candidate.source.files[i].path);return f.sha256!==request.candidate.source.files[i].sha256;});assert.deepEqual(changed.map(f=>f.path),[previewPath]);
 const changedBuild=buildPaths.baseline.filter(path=>request.baseline.buildFiles[path]!==request.candidate.buildFiles[path]);assert.deepEqual(changedBuild,['scripts/prepare-cabin.mjs'],'Only the bounded preparation output may change among common build inputs');
}
export function validateComparisonEnvironment(env,request) {
 for(const [key,value] of Object.entries({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push'}))assert.equal(env[key],value,key);
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);comparisonRequestPath(env.R35_SELECTOR_COMMIT_MESSAGE??'');assert.ok(['baseline','candidate'].includes(env.R35_SELECTOR_LANE));captureLabels(env.R35_QA_VIEWPORT,env.R35_SELECTOR_MODE);for(const key of Object.keys(env).filter(k=>k.startsWith('R35_')))assert.ok(['R35_SELECTOR_COMMIT_MESSAGE','R35_SELECTOR_LANE','R35_QA_VIEWPORT','R35_SELECTOR_MODE'].includes(key),`Unreviewed override ${key}`);
 assertSourcePair(request);assert.equal(request.allow,true,'Selector topology comparison is disabled');const lane=request[env.R35_SELECTOR_LANE],settings=comparisonSettings(env.R35_QA_VIEWPORT);return {lane:env.R35_SELECTOR_LANE,mode:env.R35_SELECTOR_MODE,name:settings.name,commit:lane.commit==='current'?env.GITHUB_SHA:lane.commit,expected:lane,baseUrl:'http://127.0.0.1:4178',viewport:settings.viewport,deviceScaleFactor:settings.deviceScaleFactor,isMobile:settings.isMobile,hasTouch:settings.hasTouch};
}
export async function verifyFilePins(root,pins,expectedPaths) {keys(pins,expectedPaths);assert.ok(expectedPaths.length>0);for(const [path,digest] of Object.entries(pins)){assert.ok(/^(scripts|qa|tests|\.github|public\/environments|modeldata|filmdata)\//.test(path)&&!path.split('/').includes('..'));hash(digest);const full=resolve(root,path),info=await lstat(full);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(sha256(await readFile(full)),digest,`Exact helper/build pin ${path}`);}}
export async function inspectMaterialModel(bytes,expected,lane,baselineBytes,value=contract) {
 comparisonProfile(value);assert.ok(['baseline','candidate'].includes(lane));assert.equal(bytes.length,expected.bytes);assert.equal(sha256(bytes),expected.sha256);assert.equal(baselineBytes.length,baselineModel.bytes);assert.equal(sha256(baselineBytes),baselineModel.sha256);
 const verified=lane==='candidate'?await verifyFrozenTopology(baselineBytes,bytes):{sha256:baselineModel.sha256,bytes:baselineModel.bytes};
 const n=baselineBytes.readUInt32LE(12),document=JSON.parse(baselineBytes.subarray(20,20+n)),bin=baselineBytes.subarray(28+n);assert.equal(document.images.length,11);
 const images=document.images.map((image,index)=>{assert.equal(image.uri,undefined);const view=document.bufferViews[image.bufferView];assert.equal(view.buffer??0,0);const body=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);assert.equal(body.length,view.byteLength);return{name:image.name??`embedded-image-${index}`,bytes:body.length,mimeType:image.mimeType,sha256:sha256(body)};});
 return {images,changes:lane==='candidate'?[{kind:'selector-support-topology',meshes:[163,164]}]:[],normalizedDocumentSha256:sha256(JSON.stringify(document)),baselineBinarySha256:sha256(bin),verified};
}
export function captureLabels(viewport,mode) {assert.ok(['desktop','mobile'].includes(viewport));assert.ok(['acceptance','diagnostic'].includes(mode));if(mode==='diagnostic'){assert.equal(viewport,'desktop');return ['initial','driver','shifter-top'];}return ['initial','driver','passenger','exterior-restored','driver-repeat'];}
async function verifyFrozenTopology(baselineBytes,bytes) {
 assert.ok(frozenCandidate,'Topology verifier and exact identity remain pending');
 assert.deepEqual({bytes:bytes.length,sha256:sha256(bytes)},{bytes:frozenCandidate.model.bytes,sha256:frozenCandidate.model.sha256});
 const {verifySelectorTopologyCandidate}=await import('./selector-topology/verify-selector-topology.mjs');
 const verified=verifySelectorTopologyCandidate(baselineBytes,bytes);
 assert.deepEqual(verified.costs,frozenCandidate.costs,'Exact reviewed cost receipt');
 return verified;
}
export function assertMatchedPair(baseline,candidate,request) {
 assertSourcePair(request);assert.equal(request.allow,true);
 return assertMatchedEvidence(baseline,candidate,request);
}
/** Evidence validation only. Executable pair acceptance also requires assertSourcePair above. */
export function assertMatchedEvidence(baseline,candidate,request) {
 assert.equal(request.allow,true);
 for(const [lane,row] of [['baseline',baseline],['candidate',candidate]]) {
  assert.equal(row.result,'passed');assert.equal(row.lane,lane);assert.equal(row.contract,contract);assert.equal(row.requestSha256,sha256(JSON.stringify(request)));assert.deepEqual(row.source,request[lane].source);assert.deepEqual(row.model,request[lane].model);assert.equal(row.sourceCommit,lane==='baseline'?baselineCommit:row.harnessCommit);assert.match(row.harnessCommit,/^[a-f0-9]{40}$/);assert.deepEqual(row.budgets,budgets);assert.equal(row.quality,'standard');assert.deepEqual(row.settings,comparisonSettings(row.viewport));
  for(const key of ['errors','pageErrors','console'])assert.deepEqual(row[key],[]);assert.deepEqual(row.cleanup,{receipts:'passed',context:'closed',browser:'closed',server:'closed'});assert.equal(row.runtimeBodyLedger.state,'finished');assert.deepEqual(row.runtimeBodyLedger.errors,[]);assert.deepEqual(row.runtimeBodyLedger.lateEvents,[]);assert.equal(row.material.images.length,11);assert.equal(row.residentCohort.bitmapIds.length,11);assert.equal(row.resourceRetirement.closedBitmapIds.length,11);assert.deepEqual(assertCabinResourcesReleased(row.residentCohort,row.resources),row.resourceRetirement);
  const bodies=row.runtimeBodyLedger.requests.filter(b=>b.path===row.model.path);assert.equal(bodies.length,1);assert.equal(bodies[0].state,'body-completed');assert.equal(bodies[0].bytes,row.model.bytes);assert.equal(bodies[0].sha256,row.model.sha256);assertComparisonModelReceipt(row.nativeModelReceipt,row.model,row.runtimeBodyLedger.requests);
  assert.deepEqual(row.captures.map(c=>c.label),captureLabels(row.viewport,row.mode));const owner=row.captures[0].certificate.owner;
  for(const capture of row.captures){const seat=['initial','exterior-restored'].includes(capture.label)?null:capture.label==='passenger'?'passenger':'driver';assert.equal(capture.seat,seat);assert.equal(capture.certificate.owner,owner);assertNativeCertificate(capture.certificate,row.observation,row.settings,seat);assert.match(capture.renderer.renderer,/SwiftShader/i);assert.equal(capture.renderer.antialias,true);assert.ok(capture.renderer.samples>=2&&capture.renderer.sampleBuffers>=1);assert.equal(capture.file,capture.label+'.png');hash(capture.sha256);assert.ok(capture.bytes>0);assert.deepEqual(capture.png,{width:row.settings.viewport.width,height:row.settings.viewport.height});assert.equal(capture.pixels.blank,false);assert.equal(capture.readinessWindow.budget,capture.label==='initial'?budgets.initial:budgets.functional);assert.equal(capture.screenshotWindow.budget,budgets.screenshot);assert.ok(capture.certificate.readyAt-capture.certificate.armedAt<=capture.readinessWindow.budget);
   if(capture.label==='shifter-top')assertCloseupCapture(capture,row.observation,row.settings,row.transform);else if(seat){const oracle=createCabinOracle(row.transform);oracle.reset(seat);const d=capture.certificate.snapshot.dimensions;assert.ok(oracle.compare(capture.certificate.snapshot,d.renderWidth,d.renderHeight));}}
  for(let index=1;index<row.captures.length;index++){const before=row.captures[index-1].certificate,after=row.captures[index].certificate;assert.ok(after.armedAt>=before.readyAt,'Every next capture arms after prior native completion');assert.ok(after.mainDrawId>before.mainDrawId,'Every capture requires its own newer completed main draw');}
  if(row.mode==='acceptance')assertRestoredExteriorPose(row.captures[3].certificate.snapshot.pose,row.captures[0].certificate.snapshot.pose);
  else assertCloseupFromDriver(row.captures[1],row.captures[2]);
 }
 assert.deepEqual(baseline.material.changes,[]);assert.deepEqual(candidate.material.changes,[{kind:'selector-support-topology',meshes:[163,164]}]);
 const shared=row=>sharedAssetBodies(row.runtimeBodyLedger.requests.filter(b=>b.path!==row.model.path)).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(shared(baseline),shared(candidate));assert.equal(baseline.harnessCommit,candidate.harnessCommit);assert.equal(baseline.viewport,candidate.viewport);assert.equal(baseline.mode,candidate.mode);assert.deepEqual(baseline.settings,candidate.settings);assert.deepEqual(baseline.transform,candidate.transform);for(const key of ['images','normalizedDocumentSha256','baselineBinarySha256'])assert.deepEqual(baseline.material[key],candidate.material[key]);
 const pairs=[];for(const label of (baseline.mode==='acceptance'?['driver','passenger']:['driver','shifter-top'])) {const a=baseline.captures.find(c=>c.label===label),b=candidate.captures.find(c=>c.label===label);assert.deepEqual(a.certificate.snapshot,b.certificate.snapshot,'Entire completed scene/camera snapshot must match');assert.deepEqual(a.bounds,b.bounds);assert.deepEqual(a.renderer,b.renderer);pairs.push({view:label,baseline:a.file,candidate:b.file,baselineSha256:a.sha256,candidateSha256:b.sha256});}
 const counts=[baseline,candidate].map(row=>{const owner=row.captures[0].certificate.owner,contexts=row.observation.contexts.filter(c=>c.owner===owner);assert.equal(contexts.length,1);assert.equal(contexts[0].connected,false);const programs=row.observation.resources.filter(r=>r.kind==='program'&&r.contextId===contexts[0].id);assert.ok(programs.length>0);for(const resource of row.observation.resources.filter(r=>r.contextId===contexts[0].id)){assert.equal(resource.deleted,1);assert.equal(resource.deletedLive,true);}return {textures:row.residentCohort.textureIds.length,programs:programs.length};});assert.deepEqual(counts[0],counts[1],'Bounded topology update must add no texture/program allocation');
 return {viewport:baseline.viewport,mode:baseline.mode,acceptance:baseline.mode==='acceptance',release:false,matched:true,pairs,nativeAllocations:{baseline:counts[0],candidate:counts[1]},scope:'Exact matched software-WebGL eligibility only. Actual support topology, intact rim/carbon/silhouette and close-up occlusion require independent image review. Diagnostic evidence cannot substitute for either acceptance viewport. No timing, performance or physical-device claim.'};
}
