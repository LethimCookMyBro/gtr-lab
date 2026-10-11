/** Separate closed candidate-only treatment; old opaque-sheet request stays unchanged. */
import assert from 'node:assert/strict';
import { viewports } from './ui-optimization-policy.mjs';
import { assessCandidateDrawerLane } from './drawer-compositing-policy.mjs';
export const scrimContract='drawer-scrim-only-candidate-v1';
export const scrimBaseCommit='a5f080d7f8c61d15255af025e8ec03ff1f544e44';
export const scrimBaseTree='cc9236f314433e932c765c67cfe8f9a2912f47bf9995bee92fb2847c7f2e33b3';
export const scrimCandidateTree='f530e2009115310a5c229d7024d3dc99dcb0d5ff0939d76cba4f9aeb947942c0';
export function validateScrimRequest(request,env) {
  assert.deepEqual(Object.keys(request).sort(),['allow','baselineCommit','baselineTree','candidateTree','contract','version'].sort());
  assert.equal(request.version,1);assert.equal(request.allow,true);assert.equal(request.contract,scrimContract);
  assert.equal(request.baselineCommit,scrimBaseCommit);assert.equal(request.baselineTree,scrimBaseTree);assert.equal(request.candidateTree,scrimCandidateTree);assert.match(request.candidateTree,/^[a-f0-9]{64}$/);
  assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.GITHUB_SHA,scrimBaseCommit);
  assert.equal(env.R35_ALLOW_DRAWER_COMPOSITING,'1');assert.equal(env.R35_DRAWER_CANDIDATE_ONLY,'1');assert.equal(env.R35_DRAWER_SCRIM_ONLY,'1');
  assert.ok(env.R35_DRAWER_COMMIT_MESSAGE?.includes('[stage-drawer-scrim-only]'));assert.ok(!env.R35_DRAWER_COMMIT_MESSAGE?.includes('[release-'));
  assert.ok(['desktop','narrow','short','reduced'].includes(env.R35_DRAWER_VIEWPORT));
  for(const key of ['R35_UI_URL','R35_UI_ROOT','R35_SOURCE_SHA','HOME_QA_URL','R35_DRAWER_URL','R35_DRAWER_ROOT'])assert.equal(env[key],undefined);
  return {...viewports[env.R35_DRAWER_VIEWPORT],name:env.R35_DRAWER_VIEWPORT,origin:'http://127.0.0.1:4189'};
}
export function assessScrimCandidate(row,request) {
  const result=assessCandidateDrawerLane(row,request,'none');
  if(row?.contract!==scrimContract||request.contract!==scrimContract||request.candidateTree!==scrimCandidateTree){result.failures.push('Exact scrim source/profile identity missing or wrong');result.status='failed';}
  return {...result,contract:scrimContract,scope:'candidate-only-scrim-treatment'};
}
