/** Closed public fine-cabin acceptance. Historical staged/public profiles remain untouched. */
import assert from 'node:assert/strict';
import {sha256,assertSourcePair,comparisonProfile,fineRoughnessContract,comparisonSettings} from './cabin-leather-comparison-policy.mjs';
export const liveOrigin='https://gtr-lab-production.up.railway.app';
export const liveContract='r35-cabin-fine-roughness-public-v1';
export const liveReleaseToken='[release-cabin-fine-roughness]';
export const liveReleaseMarker='release-cabin-realism-approved-20261007-1640.approved';
export const liveStagedSource='1a667aa902aa45f160b3526476fefd588f84e243';
export const liveSourceTree='7632e86545bdd559e38cac1133245b5b284b5bbb1b97d2fc6100ad66d021011b';
export const comparisonPath='qa/cabin-fine-roughness-comparison-request.json';
export const stagedArchivePath='qa/cabin-preview/fine-roughness/comparison-request-1a667aa9.json';
export const liveModel=Object.freeze({path:'/models/r35-cabin-fine-roughness-ed88ad0e.glb',bytes:20196108,sha256:'ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0',gzipBytes:10194113,gzipSha256:'b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5'});
export const derivationPins=Object.freeze({
 'scripts/collect-cabin-leather-comparison.mjs':'55b4447832474776d78b883ccd4daf4abdb9797ad70ff01159c244cc8e0eb0d8',
 'scripts/cabin-leather-model-body.mjs':'36d645367ff8706aa6d721ff397b0d34a7ace32e704f6f89ac75f2fe4cfdc66c',
 'scripts/diagnose-cabin-preparation.mjs':'38a510ded2e1737fe2472fca2fbaf16b6efc039fa173719f90d3ff7a74533bf3',
});
export const liveHelperPaths=Object.freeze([...comparisonProfile(fineRoughnessContract).helperPaths,
 'scripts/diagnose-cabin-preparation.mjs','scripts/verify-release-assets.mjs','scripts/wait-railway.mjs',
 'scripts/cabin-fine-live-policy.mjs','scripts/cabin-fine-live.mjs','tests/cabin-fine-live.node.mjs','.github/workflows/cabin-fine-live.yml',stagedArchivePath]);
const keys=(value,expected)=>assert.deepEqual(Object.keys(value??{}).sort(),[...expected].sort());
export function validateLiveInvocation(env) {
 for(const [key,value] of Object.entries({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',R35_ALLOW_FINE_CABIN_LIVE:'1'}))assert.equal(env[key],value,key);
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.GITHUB_SHA,liveStagedSource,'Release must be distinct from reviewed staging');
 assert.ok(env.R35_FINE_CABIN_LIVE_COMMIT_MESSAGE?.includes(liveReleaseToken));assert.equal(env.R35_FINE_CABIN_LIVE_COMMIT_MESSAGE.includes('[stage-'),false);
 assert.ok(['desktop','mobile'].includes(env.R35_QA_VIEWPORT));
 for(const name of Object.keys(env).filter(name=>/^R35_/.test(name)))assert.ok(['R35_ALLOW_FINE_CABIN_LIVE','R35_FINE_CABIN_LIVE_COMMIT_MESSAGE','R35_QA_VIEWPORT'].includes(name),`Unreviewed override ${name}`);
}
export function validateLiveRequest(request,comparison,env) {
 validateLiveInvocation(env);keys(request,['version','allow','contract','stagedSource','sourceTree','comparisonRequestSha256','helperPins']);
 assert.deepEqual({...request,helperPins:undefined},{version:1,allow:true,contract:liveContract,stagedSource:liveStagedSource,sourceTree:liveSourceTree,comparisonRequestSha256:sha256(JSON.stringify(comparison)),helperPins:undefined});
 assertSourcePair(comparison);assert.equal(comparison.allow,false,'Staged comparison must be inactive at release');assert.equal(comparison.contract,fineRoughnessContract);assert.equal(comparison.candidate.source.sha256,liveSourceTree);assert.deepEqual(comparison.candidate.model,liveModel);
 keys(request.helperPins,liveHelperPaths);for(const hash of Object.values(request.helperPins))assert.match(hash,/^[a-f0-9]{64}$/);
 return request;
}
export function validateLiveMarker(marker,request,comparison,env) {
 validateLiveRequest(request,comparison,env);
 const expected={version:1,allow:true,contract:liveContract,release:liveReleaseToken,stagedSource:liveStagedSource,sourceTree:liveSourceTree,comparisonRequestSha256:request.comparisonRequestSha256,liveRequestSha256:sha256(JSON.stringify(request)),modelPath:liveModel.path,modelSha256:liveModel.sha256,modelBytes:liveModel.bytes,modelGzipSha256:liveModel.gzipSha256,modelGzipBytes:liveModel.gzipBytes};
 assert.deepEqual(marker,expected,'Separate watched marker must bind exact live request, approved stage and raw/gzip model');return marker;
}
export function assertLiveRevision(revision,env) {
 validateLiveInvocation(env);assert.equal(revision.commit,env.GITHUB_SHA);assert.equal(revision.message.trim(),env.R35_FINE_CABIN_LIVE_COMMIT_MESSAGE.trim());assert.equal(revision.trackedStatus,'','Clean tracked release required');assert.equal(revision.stagedIsAncestor,true);assert.ok(revision.changedFiles.includes(liveReleaseMarker));assert.match(revision.gitTree??'',/^[a-f0-9]{40}$/);
}
export function validateLiveTarget(env,comparison,identity) {
 validateLiveRequest(identity.request,comparison,env);validateLiveMarker(identity.release,identity.request,comparison,env);assertLiveRevision(identity.revision,env);assert.deepEqual(identity.source,comparison.candidate.source);
 const settings=comparisonSettings(env.R35_QA_VIEWPORT);
 return {lane:'candidate',name:settings.name,commit:env.GITHUB_SHA,expected:comparison.candidate,baseUrl:liveOrigin,viewport:settings.viewport,deviceScaleFactor:settings.deviceScaleFactor,isMobile:settings.isMobile,hasTouch:settings.hasTouch};
}

import {budgets,models} from './cabin-preparation-policy.mjs';
import {assertNativeCertificate} from './cabin-leather-comparison-policy.mjs';
import {assertCabinResourcesReleased} from './cabin-resource-assertions.mjs';
export function assertLiveCaptureReport(row,identity,env,assertPublicReceipt) {
 const target=validateLiveTarget(env,identity.comparison,identity);assert.equal(row.result,'passed');assert.equal(row.contract,liveContract);assert.equal(row.materialContract,identity.comparison.contract);assert.equal(row.requestSha256,sha256(JSON.stringify(identity.comparison)));
 assert.deepEqual(row.publicRelease,identity);assert.deepEqual(row.publicPreflight,identity.publicPreflight);assert.equal(identity.fullTrackedCheckoutClean,true);
 assert.equal(row.sourceCommit,env.GITHUB_SHA);assert.equal(row.harnessCommit,env.GITHUB_SHA);assert.deepEqual(row.source,identity.comparison.candidate.source);assert.deepEqual(row.model,liveModel);assert.equal(row.lane,'candidate');assert.equal(row.viewport,target.name);assert.deepEqual(row.budgets,budgets);assert.equal(row.quality,'standard');assert.deepEqual(row.settings,comparisonSettings(target.name));
 for(const key of ['errors','pageErrors','console'])assert.deepEqual(row[key],[]);assert.deepEqual(row.cleanup,{receipts:'passed',context:'closed',browser:'closed'});
 const ledger=row.runtimeBodyLedger;assert.equal(ledger.state,'finished');assert.deepEqual(ledger.errors,[]);assert.deepEqual(ledger.lateEvents,[]);for(const body of ledger.requests){assert.equal(new URL(body.url).origin,liveOrigin);assert.equal(body.state,'body-completed');}
 assertPublicReceipt(row.nativeModelReceipt,liveModel,ledger.requests);
 assert.equal(row.material.images.length,11);assert.equal(row.residentCohort.bitmapIds.length,11);assert.equal(row.resourceRetirement.closedBitmapIds.length,11);assert.deepEqual(assertCabinResourcesReleased(row.residentCohort,row.resources),row.resourceRetirement);
 assert.deepEqual(row.captures.map(c=>c.label),['initial','driver','passenger','exterior-restored','driver-repeat']);
 for(const capture of row.captures){const seat=capture.label==='initial'||capture.label==='exterior-restored'?null:capture.label==='passenger'?'passenger':'driver';assert.equal(capture.seat,seat);assertNativeCertificate(capture.certificate,row.observation,target,seat);assert.equal(capture.file,capture.label+'.png');assert.match(capture.sha256,/^[a-f0-9]{64}$/);assert.ok(capture.bytes>0);assert.deepEqual(capture.png,{width:target.viewport.width,height:target.viewport.height});assert.equal(capture.pixels.blank,false);}
 const preflight=row.publicPreflight;assert.equal(preflight.assets.status,'passed');assert.equal(preflight.assets.commit,env.GITHUB_SHA);assert.equal(preflight.assets.origin,liveOrigin);assert.ok(preflight.assets.assets.some(a=>a.path.endsWith('.js'))&&preflight.assets.assets.some(a=>a.path.endsWith('.css')));
 const {gzipBytes,gzipSha256,...fine}=liveModel;assert.deepEqual(preflight.models,[fine,...models.slice(1)].map(model=>({...model,url:liveOrigin+model.path})));
 assert.deepEqual(preflight.transport.map(r=>r.acceptEncoding),['identity','gzip','gzip;q=0']);
 for(const receipt of preflight.transport){const compressed=receipt.acceptEncoding==='gzip';assert.equal(receipt.status,200);assert.equal(receipt.contentEncoding,compressed?'gzip':'identity');assert.match(receipt.vary,/(?:^|,\s*)Accept-Encoding(?:,|$)/i);assert.equal(receipt.wireEntityBytes,compressed?liveModel.gzipBytes:liveModel.bytes);assert.equal(receipt.wireEntitySha256,compressed?liveModel.gzipSha256:liveModel.sha256);assert.equal(receipt.decodedBytes,liveModel.bytes);assert.equal(receipt.decodedSha256,liveModel.sha256);}
}
