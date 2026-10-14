import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {naturalStartup} from '../scripts/home-repair-live.mjs';
import {liveOrigin,liveReleaseMarker,expectedLiveRequest,validateLiveRequest,validateLiveMarker,acceptedSource,acceptedInputs} from '../scripts/home-repair-live-policy.mjs';
import {budgets} from '../scripts/home-repair-policy.mjs';
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),R35_ALLOW_HOME_LIVE:'1',R35_HOME_LIVE_MESSAGE:'Approved [release-home-repair]',R35_HOME_LIVE_VIEWPORT:'mobile'};
const source=()=>readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');
test('live adapter is inactive or explicitly bound to its approved stage/request/marker',async()=>{
  const request=JSON.parse(await readFile(new URL('../qa/home-repair-live-request.json',import.meta.url),'utf8'));
  if(request.allow===false){assert.throws(()=>validateLiveRequest(request,env));if(expectedLiveRequest.stagedCommit==='0'.repeat(40))assert.throws(()=>validateLiveRequest(expectedLiveRequest,env),/accepted staged commit/);await assert.rejects(access(new URL('../'+liveReleaseMarker,import.meta.url)));}
  else {
    validateLiveRequest(request,env);let markerText;
    try{markerText=await readFile(new URL('../'+liveReleaseMarker,import.meta.url),'utf8');}catch(error){assert.equal(error.code,'ENOENT');}
    if(markerText!==undefined)validateLiveMarker(JSON.parse(markerText),request);
    else {const runner=await readFile(new URL('../scripts/home-repair-live.mjs',import.meta.url),'utf8');assert.match(runner,/const marker=JSON.parse\(await readFile\(resolve\(root,liveReleaseMarker\)/);assert.match(runner,/validateLiveMarker\(marker,request\)/);}
  }
  assert.equal(liveOrigin,'https://gtr-lab-production.up.railway.app');assert.equal(request.sourceTree,acceptedSource);assert.equal(request.inputTree,acceptedInputs);
});
test('a marker cannot omit or alter the exact audio/photo/model/source pins',()=>{
  const good={...expectedLiveRequest,release:'[release-home-repair]'};assert.doesNotThrow(()=>validateLiveMarker(good,expectedLiveRequest));for(const key of ['sourceTree','inputTree','audio','model','formulaPhoto']){const bad=structuredClone(good);delete bad[key];assert.throws(()=>validateLiveMarker(bad,expectedLiveRequest));}
});
test('staged exercise and screenshot behavior are byte-equivalent after export/factory normalization',async()=>{
  let text=await source();const start=text.indexOf('export function createHomeShot('),end=text.indexOf('export async function main(',start);assert.ok(start>0&&end>start);
  const block=text.slice(start,end),body=block.slice(block.indexOf('  return async('),block.lastIndexOf('}\n')).replace('  return async(label,locator,options={})=>{','    const shot=async(label,locator,options={})=>{').replace('      const page=getPage();\n','');
  text=text.slice(0,start)+text.slice(end);text=text.replace('    const shot=createHomeShot({getPage:()=>page,row,target,deadline,alive,output,save,PNG,posterReference,lane});\n',body);
  text=text.replace('export function homeSnapshot(carHeld=false) {','function homeSnapshot(carHeld=false) {');
  text=text.replace('export async function exercise({page,context,row,shot,check,save,receipts,target,held,initialStarted,startup}) {\n  if(startup)await startup();else {','async function exercise({page,context,row,shot,check,save,receipts,target,held,initialStarted}) {');
  text=text.replace("  await held.poster.release();await held.car.release();row.heldRequests=held.snapshot();await save();\n  }\n  await check('real-rear-ready'","  await held.poster.release();await held.car.release();row.heldRequests=held.snapshot();await save();\n  await check('real-rear-ready'");
  assert.equal(createHash('sha256').update(text).digest('hex'),'292091fc760f35f55377f744650795419b65a9b7f83ae89fd7381fc7d3a15c9d');
});
test('live runner reuses exact assets/body/native/capture helpers without held requests, server or baseline',async()=>{
  const text=await readFile(new URL('../scripts/home-repair-live.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(text,/holdOriginalRequest|\.route\(|route\.continue|route\.fulfill|createAppServer|\.listen\(|bypassCSP|lane:'baseline'/);
  for(const helper of ['verifyCheckout','verifyReleaseAssets','createUiReceipts','installHomeRepairGpuObserver','installHomeRepairAudioObserver','createHomeShot','exercise({'])assert.ok(text.includes(helper));
  assert.ok(text.indexOf('row.publicPreflight=await verifyReleaseAssets')<text.indexOf('browser=await chromium.launch'));
  assert.match(text,/AbortSignal.timeout\(budgets.body\)/);assert.match(text,/startup:\(\)=>naturalStartup/);assert.match(text,/receipts.finish\(\)/);
});
test('natural startup is separately labelled and retains the single initial navigation window',()=>{
  const text=naturalStartup.toString();assert.match(text,/initialStarted\+budgets.initialPage/);assert.match(text,/natural-decoded-poster-and-menu/);assert.match(text,/No held-request or car-pending causal proof/);assert.doesNotMatch(text,/\.route\(|held\.|force:|setTimeout/);
  assert.deepEqual(budgets,{initialPage:25000,nativeInitial:45000,nativeLater:30000,ready:90000,screenshot:45000,command:5000,cleanup:15000,body:15000,lane:300000});
});
test('live workflow is read-only, release-only, and waits for exact Railway deployment',async()=>{
  const text=await readFile(new URL('../.github/workflows/home-repair-live.yml',import.meta.url),'utf8');assert.match(text,/contents: read/);assert.match(text,/release-home-repair-approved-20261014\.approved/);assert.match(text,/wait-railway\.mjs/);assert.match(text,/persist-credentials: false/);assert.doesNotMatch(text,/contents: write|railway up|git push|workflow_dispatch/);
});

test('live invocation rejects alternate origins, sources, budgets, staging and unrelated repository events',()=>{
 for(const patch of [{CI:'false'},{GITHUB_ACTIONS:'false'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{R35_HOME_LIVE_MESSAGE:'[stage-home-repair]'},{R35_HOME_LIVE_VIEWPORT:'unknown'},{R35_HOME_LIVE_URL:'https://example.test'},{R35_SOURCE_SHA:'b'.repeat(40)},{R35_CAPTURE_TIMEOUT:'90000'},{HOME_QA_URL:'https://example.test'}])assert.throws(()=>validateLiveRequest(expectedLiveRequest,{...env,...patch}),error=>!String(error).includes('Final accepted staged commit'));
});

test('exact81f live request targets all four accepted viewports and rejects drifted source/input/model pins',()=>{
 for(const name of ['desktop','mobile','tablet','landscape']){const target=validateLiveRequest(expectedLiveRequest,{...env,R35_HOME_LIVE_VIEWPORT:name});assert.equal(target.name,name);assert.equal(target.origin,liveOrigin);}
 assert.equal(expectedLiveRequest.stagedCommit,'81f67c3e28229b68d5583781680a885cb4d375d6');assert.equal(expectedLiveRequest.sourceTree,'a0fcd2aec6e4e353ffc4099120a78f467928ebb7b0026deb52749a1ae3dec230');
 for(const key of ['stagedCommit','sourceTree','inputTree','model','audio','formulaPhoto']){const changed=structuredClone(expectedLiveRequest);changed[key]='drift';assert.throws(()=>validateLiveRequest(changed,env));}
});
