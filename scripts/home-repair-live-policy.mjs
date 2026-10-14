/** Private exact-stage candidate-only release contract. No deployment authority. */
import assert from 'node:assert/strict';
import {viewports,model,audio,formulaPhoto} from './home-repair-policy.mjs';
export const liveOrigin='https://gtr-lab-production.up.railway.app';
export const liveContract='home-repair-public-candidate-20261014-v1';
export const liveReleaseToken='[release-home-repair]';
export const liveReleaseMarker='release-home-repair-approved-20261014.approved';
// Exact reviewed staging identity; runtime still requires the separately approved release marker.
export const acceptedStageCommit='161cffe8a371e5b480f1ee581e62dcc0499e7386';
export const acceptedSource='44a235ce77f9a4a9e53e66212c59b94b94940133e9737b893c71acbf0acc7127';
export const acceptedInputs='f72be7c75795563b91ed5e0158eb788a4ad0b16f25429152f3c7010e52afb0a0';
export const expectedLiveRequest=Object.freeze({version:1,allow:true,contract:liveContract,stagedCommit:acceptedStageCommit,sourceTree:acceptedSource,inputTree:acceptedInputs,model,audio,formulaPhoto});
export function validateLiveRequest(request,env) {
  assert.deepEqual(request,expectedLiveRequest,'Separate exact reviewed live request required');
  for(const [key,value] of Object.entries({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',R35_ALLOW_HOME_LIVE:'1'}))assert.equal(env[key],value,key);
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.GITHUB_SHA,acceptedStageCommit);
  assert.ok(env.R35_HOME_LIVE_MESSAGE?.includes(liveReleaseToken));assert.ok(!env.R35_HOME_LIVE_MESSAGE?.includes('[stage-'));
  assert.ok(Object.hasOwn(viewports,env.R35_HOME_LIVE_VIEWPORT));
  for(const key of Object.keys(env).filter(key=>key.startsWith('R35_')))assert.ok(['R35_ALLOW_HOME_LIVE','R35_HOME_LIVE_MESSAGE','R35_HOME_LIVE_VIEWPORT'].includes(key),`No live target/source/budget override: ${key}`);
  for(const key of ['HOME_QA_URL','PREVIEW_BASE_URL'])assert.equal(env[key],undefined);
  assert.notEqual(acceptedStageCommit,'0'.repeat(40),'Final accepted staged commit is not pinned');
  return {name:env.R35_HOME_LIVE_VIEWPORT,viewport:viewports[env.R35_HOME_LIVE_VIEWPORT],origin:liveOrigin};
}
export function validateLiveMarker(marker,request) {
  assert.deepEqual(marker,{...request,release:liveReleaseToken},'Separate release marker must bind exact source, inputs and assets');
}
export function assertLiveRevision(revision,request,env) {
  assert.equal(revision.commit,env.GITHUB_SHA);assert.equal(revision.message.trim(),env.R35_HOME_LIVE_MESSAGE.trim());
  assert.equal(revision.stagedIsAncestor,true);assert.ok(revision.changedFiles.includes(liveReleaseMarker));
  assert.equal(request.stagedCommit,acceptedStageCommit);assert.notEqual(revision.commit,acceptedStageCommit);
}
