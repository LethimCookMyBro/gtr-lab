/** Reconstructed 2026-10-14. Closed staged-only contract; imports no browser/socket code. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export { sourceIdentity, sha256 } from './ui-optimization-policy.mjs';
import { sha256 } from './ui-optimization-policy.mjs';
export const contract = 'home-repair-reconstructed-20261014-v1';
export const baselineCommit = '75db282ea80770c3b7772c1ad8d5e994f3ddd1af';
export const budgets = Object.freeze({initialPage:25000,nativeInitial:45000,nativeLater:30000,ready:90000,screenshot:45000,command:5000,cleanup:15000,body:15000,lane:300000});
export const viewports = Object.freeze({desktop:{width:1440,height:900},mobile:{width:390,height:844},tablet:{width:820,height:1180},landscape:{width:1024,height:768}});
export const supplementaryViewports = Object.freeze({narrow:{width:320,height:568},shortLandscape:{width:568,height:320}});
export const origin = 'http://127.0.0.1:4189';
export const model = Object.freeze({path:'/models/ciasny-r35.glb',bytes:8296356,sha256:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d'});
export const audio = Object.freeze({path:'/audio/nissan-gtr-specv-edvvc.ogg',sha256:'496536debb72d6d540914cc330db43567fc64b85e8e7dd892d6d1dcee3051a60',durationSeconds:7.60056689342404});
export const formulaPhoto = Object.freeze({path:'/images/nissan-gen3-evo-2024-25.jpg',sha256:'4aaf4aafbfffc1825d9ab403c356fdf89415cae58603e93a60e7b583e35e7b08'});
export function validateRequest(request,env) {
  assert.deepEqual(Object.keys(request).sort(),['version','allow','contract','baselineCommit','baselineTree','candidateTree','baselineInputs','candidateInputs'].sort());
  assert.equal(request.version,1);assert.equal(request.allow,true,'Reviewed final request must explicitly allow this CI batch');assert.equal(request.contract,contract);assert.equal(request.baselineCommit,baselineCommit);
  for(const key of ['baselineTree','candidateTree','baselineInputs','candidateInputs']) {assert.match(request[key]??'',/^[a-f0-9]{64}$/);assert.notEqual(request[key],'0'.repeat(64),'Placeholder pins cannot run');}
  assert.notEqual(request.baselineTree,request.candidateTree);
  assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_EVENT_NAME,'push');
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.GITHUB_SHA,baselineCommit);assert.equal(env.R35_ALLOW_HOME_REPAIR,'1');
  assert.ok(env.R35_HOME_REPAIR_MESSAGE?.includes('[stage-home-repair]'));assert.ok(!env.R35_HOME_REPAIR_MESSAGE?.includes('[release-'));
  assert.ok(Object.hasOwn(viewports,env.R35_HOME_REPAIR_VIEWPORT));
  for(const key of ['R35_HOME_REPAIR_URL','R35_HOME_REPAIR_ROOT','R35_SOURCE_SHA','HOME_QA_URL','PREVIEW_BASE_URL','R35_HOME_REPAIR_BASELINE','R35_HOME_REPAIR_CANDIDATE'])assert.equal(env[key],undefined,`Target override forbidden: ${key}`);
  return {name:env.R35_HOME_REPAIR_VIEWPORT,viewport:viewports[env.R35_HOME_REPAIR_VIEWPORT],origin};
}
export async function treeIdentity(root,directories,additional=[],include=()=>true) {
  const paths=[];
  async function walk(directory) {for(const entry of (await readdir(resolve(root,directory),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    assert.equal(entry.isSymbolicLink(),false,`No input symlink: ${directory}/${entry.name}`);
    const path=`${directory}/${entry.name}`;if(entry.isDirectory())await walk(path);else if(entry.isFile()&&include(path))paths.push(path);
  }}
  for(const directory of directories)await walk(directory);paths.push(...additional);
  const files=[];for(const path of [...new Set(paths)].sort()){const bytes=await readFile(resolve(root,path));files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  return {sha256:sha256(JSON.stringify(files)),files};
}
export const inputIdentity=root=>treeIdentity(root,['public','modeldata','filmdata','qa/cabin-preview'],['scripts/prepare-models.mjs','scripts/prepare-cabin.mjs','scripts/prepare-films.mjs','scripts/fetch-environments.mjs','scripts/fetch-surfaces.mjs','scripts/fetch-roadside.mjs'],path=>!/^public\/(?:models\/.*\.glb(?:\.gz)?|films\/.*\.mp4|environments\/.*\.(?:hdr|jpg)|environments\/roadside\/)/.test(path));
export const distIdentity=root=>treeIdentity(root,['dist']);
export function assessAudio(before,after) {
  const findings=after.events.filter(event=>event.kind==='start'&&event.bufferDuration>7.59&&event.bufferDuration<7.62).map(start=>{
    const context=after.contexts.find(context=>context.id===start.contextId),prior=before.contexts.find(context=>context.id===start.contextId);
    const trustedGesture=after.events.some(event=>event.kind==='resume'&&event.contextId===start.contextId&&event.trustedGesture===true&&event.userActivation===true&&event.sequence<start.sequence&&event.at<=start.at);
    const clockAdvanced=!!context&&!!prior&&context.currentTime>prior.currentTime;
    const sourceEdge=after.edges.find(edge=>edge.active&&edge.from===start.nodeId&&edge.fromKind==='source'&&edge.toKind==='gain');
    const sourceGainDestination=!!sourceEdge&&after.edges.some(edge=>edge.active&&edge.from===sourceEdge.to&&edge.toKind==='destination');
    const nonzeroPostGain=!!sourceEdge&&after.samples.some(sample=>sample.contextId===start.contextId&&sample.gainNodeId===sourceEdge.to&&sample.sequence>start.sequence&&sample.at>=start.at&&sample.connectedToDestination&&sample.peak>1e-7&&sample.rms>1e-9);
    return {trustedGesture,clockAdvanced,sourceStarted:true,sourceGainDestination,nonzeroPostGain,passed:trustedGesture&&clockAdvanced&&sourceGainDestination&&nonzeroPostGain,sourceNodeId:start.nodeId,contextId:start.contextId};
  });
  return findings.find(finding=>finding.passed)??findings[0]??{trustedGesture:false,clockAdvanced:false,sourceStarted:false,sourceGainDestination:false,nonzeroPostGain:false,passed:false};
}
export function assessGate(snapshot) {return {posterDecoded:snapshot.poster==='decoded'&&snapshot.posterNaturalWidth>0,gateResolved:snapshot.gate==='resolved'&&!snapshot.gateOpen,homeUsable:!snapshot.inert,carStillPending:snapshot.carHeld&&snapshot.scene!=='ready'};}
