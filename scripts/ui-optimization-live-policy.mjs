/** Separate candidate-only public contract. Historical staged/cabin contracts stay closed. */
import assert from 'node:assert/strict';
import { models, cabinWire } from './cabin-preparation-policy.mjs';
export const liveOrigin = 'https://gtr-lab-production.up.railway.app';
export const liveContract = 'ui-optimization-public-candidate-v1';
export const liveReleaseToken = '[release-ui-optimization]';
export const liveReleaseMarker = 'release-ui-optimization-approved-20261011.approved';
export const liveStagedSource = 'f975d55468504b8c52151f9d89cf37cf2f988957';
export const liveSourceTree = 'f530e2009115310a5c229d7024d3dc99dcb0d5ff0939d76cba4f9aeb947942c0';
export const liveViewports = Object.freeze({desktop:{width:1440,height:900},narrow:{width:320,height:568},mobile:{width:390,height:844}});
const keys = (object, expected) => assert.deepEqual(Object.keys(object).sort(), [...expected].sort());
export function validateLiveRequest(request, env) {
  keys(request, ['version','allow','contract','stagedSource','sourceTree','modelSha256']);
  assert.deepEqual(request, {version:1,allow:true,contract:liveContract,stagedSource:liveStagedSource,sourceTree:liveSourceTree,modelSha256:models[0].sha256});
  assert.equal(env.GITHUB_ACTIONS,'true'); assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');
  assert.equal(env.GITHUB_REF,'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME,'push');
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/); assert.notEqual(env.GITHUB_SHA,liveStagedSource);
  assert.equal(env.R35_ALLOW_UI_LIVE,'1');
  assert.ok(env.R35_UI_LIVE_COMMIT_MESSAGE?.includes(liveReleaseToken));
  assert.equal(env.R35_UI_LIVE_COMMIT_MESSAGE.includes('[stage-'),false,'Staging cannot authorize public verification');
  assert.ok(Object.hasOwn(liveViewports,env.R35_UI_LIVE_VIEWPORT));
  for(const name of ['R35_UI_URL','R35_UI_ROOT','HOME_QA_URL','R35_DRAWER_URL','R35_DRAWER_ROOT','R35_UI_LIVE_URL','R35_UI_LIVE_ROOT','R35_SOURCE_SHA','R35_EXPECTED_APP_TREE','R35_CAPTURE_TIMEOUT','R35_MAX_BUFFER_PIXELS','R35_PREPARATION_MODE','R35_ALLOW_LIVE_PREPARATION','R35_BASE_URL','R35_MODEL_URL','R35_CABIN_BASE_URL','R35_PREPARATION_BASE_URL']) assert.equal(env[name],undefined,`No target/source/budget override: ${name}`);
  return {mode:'live',name:env.R35_UI_LIVE_VIEWPORT,origin:liveOrigin,viewport:{...liveViewports[env.R35_UI_LIVE_VIEWPORT]},deviceScaleFactor:1,reducedMotion:'no-preference'};
}
export function validateLiveMarker(marker, request, env) {
  validateLiveRequest(request,env);
  const expected = {...request,release:liveReleaseToken,modelBytes:models[0].bytes,modelGzipSha256:cabinWire.sha256,modelGzipBytes:cabinWire.bytes};
  keys(marker,Object.keys(expected)); assert.deepEqual(marker,expected,'Separate marker must bind exact staged source and raw/gzip model');
  return marker;
}
export function assertLiveDrawerStyles(styles) {
  assert.equal(styles?.sheet?.background,'rgb(23, 27, 30)','Opaque exact #171b1e sheet');
  assert.equal(styles.sheet.backdropFilter,'none'); assert.equal(styles.sheet.opacity,'1');
  assert.equal(styles.backdrop?.background,'rgba(5, 8, 9, 0.4)'); assert.equal(styles.backdrop.backdropFilter,'none');
}
export function assertLiveRevision(evidence, env) {
  assert.equal(evidence.commit,env.GITHUB_SHA);
  assert.equal(evidence.message.trim(),env.R35_UI_LIVE_COMMIT_MESSAGE.trim());
  assert.equal(evidence.trackedStatus,'','Exact release checkout must be clean');
  assert.equal(evidence.stagedIsAncestor,true,'Reviewed staged source must precede actual release');
  assert.ok(evidence.changedFiles.includes(liveReleaseMarker),'Actual release commit must change its separate marker');
}
export function assertLiveCandidate(row, env) {
  assert.equal(row.mode,'live'); assert.equal(row.lane,'candidate'); assert.equal(row.commit,env.GITHUB_SHA);
  assert.equal(row.source?.sha256,liveSourceTree); assert.equal(row.source.files.length,101); assert.equal(row.fullTrackedCheckoutClean,true);
  const preflight=row.publicPreflight,assets=preflight?.assets;
  assert.equal(assets?.status,'passed'); assert.equal(assets.origin,liveOrigin); assert.equal(assets.commit,env.GITHUB_SHA);
  assert.deepEqual(preflight.models,models.map(model=>({...model,url:liveOrigin+model.path})));
  assert.deepEqual(preflight.transport.map(receipt=>receipt.acceptEncoding),['identity','gzip','gzip;q=0']);
  for(const receipt of preflight.transport) {
    const gzip=receipt.acceptEncoding==='gzip';
    assert.equal(receipt.status,200); assert.equal(receipt.contentEncoding,gzip?'gzip':'identity');
    assert.equal(receipt.wireEntityBytes,gzip?cabinWire.bytes:models[0].bytes);
    assert.equal(receipt.wireEntitySha256,gzip?cabinWire.sha256:models[0].sha256);
    assert.equal(receipt.decodedBytes,models[0].bytes); assert.equal(receipt.decodedSha256,models[0].sha256);
  }
  for(const key of ['errors','pageErrors','requestErrors','drawerFailures']) assert.deepEqual(row[key],[],key);
  assert.deepEqual(row.cleanup,{context:'passed',browser:'passed'});
  const ledger=row.runtimeLedger;
  assert.equal(ledger?.state,'finished');
  for(const key of ['errors','eventErrors','lateEvents']) assert.deepEqual(ledger[key],[]);
  assert.deepEqual(ledger.generations.map(item=>[item.generation,item.state]),[[1,'sealed'],[2,'sealed']]);
  const pins=new Map([['/index.html',assets.html],...assets.assets.map(asset=>[asset.path,asset])]);
  assert.ok(assets.assets.some(asset=>asset.path.endsWith('.js'))&&assets.assets.some(asset=>asset.path.endsWith('.css')));
  assert.ok(ledger.requests.length>0);
  for(const item of ledger.requests) {
    assert.equal(item.state,'body-completed'); assert.ok(pins.has(item.path));
    assert.equal(item.bytes,pins.get(item.path).bytes); assert.equal(item.sha256,pins.get(item.path).sha256);
  }
  for(const generation of [1,2])for(const extension of ['/index.html','.js','.css'])assert.ok(ledger.requests.some(item=>item.generation===generation&&item.path.endsWith(extension)),`Document ${generation} missing ${extension} bytes`);
  const sequence=['nismo:Environment','nismo:Camera','nismo:route-unmount','premium:Environment','premium:Camera','premium:route-unmount'];
  assert.deepEqual(row.drawer.map(item=>`${item.model}:${item.panel}`),sequence);
  for(const entry of row.drawer)assert.ok(entry.checks?.length&&entry.checks.every(check=>check.passed===true),'Every real Drawer check must pass');
  const openings=['Environment','Environment','Camera','Camera','Switch model','Environment','Environment','Camera','Camera','Switch model'];
  assert.deepEqual(row.animationDiagnostics.map(item=>item.panel),openings); assert.deepEqual(row.openingActions.map(item=>item.panel),openings);
  row.animationDiagnostics.forEach((diagnostic,index)=>{
    assert.equal(diagnostic.status,'settled'); assert.equal(diagnostic.originalDeadlineMs,5000);
    assert.ok(Number.isFinite(diagnostic.startedAt)&&Number.isFinite(diagnostic.elapsedMs)&&diagnostic.elapsedMs>=0&&diagnostic.elapsedMs<=5000);
    const action=row.openingActions[index]; assert.equal(action.status,'returned');
    assert.ok(Number.isFinite(action.actionStartMs)&&Number.isFinite(action.clickReturnMs)&&action.clickReturnMs>=action.actionStartMs&&action.clickReturnMs<=diagnostic.startedAt);
    assert.equal(action.clickDurationMs,action.clickReturnMs-action.actionStartMs);
    if(index)assert.ok(action.actionStartMs>=row.openingActions[index-1].clickReturnMs);
  });
  assert.deepEqual(row.captures.map(item=>item.label),['nismo-environment-settled','nismo-environment-bottom','nismo-camera-settled','premium-environment-focus-settled','premium-environment-bottom','premium-camera-settled']);
  row.captures.forEach((capture,index)=>{
    assert.equal(capture.status,'captured'); assert.match(capture.sha256??'',/^[a-f0-9]{64}$/); assertLiveDrawerStyles(capture.styles);
    assert.equal(capture.originalDeadlineMs,45000);
    const times=[capture.actionStartMs,capture.captureStartMs,capture.captureReturnMs,capture.observationEndMs];
    assert.ok(times.every((time,index)=>Number.isFinite(time)&&(index===0||time>=times[index-1])));
    assert.equal(capture.captureDurationMs,capture.captureReturnMs-capture.captureStartMs);
    assert.equal(capture.observationDurationMs,capture.observationEndMs-capture.actionStartMs); assert.ok(capture.observationDurationMs<=45000);
    if(index)assert.ok(capture.actionStartMs>=row.captures[index-1].observationEndMs);
  });
}
