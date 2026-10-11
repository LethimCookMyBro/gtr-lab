import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scrimBaseCommit,scrimBaseTree,scrimCandidateTree,scrimContract,validateScrimRequest,assessScrimCandidate} from '../scripts/drawer-scrim-policy.mjs';
import {drawerBaselineCommit,drawerSequence,drawerOpenings,drawerCaptures,assessCandidateDrawerLane,validateDrawerRequest} from '../scripts/drawer-compositing-policy.mjs';
import {selectDrawerProfile} from '../scripts/drawer-compositing-browser.mjs';
const request={version:1,allow:true,contract:scrimContract,baselineCommit:scrimBaseCommit,baselineTree:scrimBaseTree,candidateTree:scrimCandidateTree};
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'f'.repeat(40),R35_ALLOW_DRAWER_COMPOSITING:'1',R35_DRAWER_CANDIDATE_ONLY:'1',R35_DRAWER_SCRIM_ONLY:'1',R35_DRAWER_VIEWPORT:'desktop',R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-scrim-only]'};
const fixture=()=>['baseline','candidate'].map(lane=>({
  lane,contract:scrimContract,commit:lane==='baseline'?drawerBaselineCommit:env.GITHUB_SHA,harnessCommit:env.GITHUB_SHA,status:'passed',
  process:{exitCode:0,timedOut:false,signal:null,ownershipRetired:true},cleanup:{context:'passed',browser:'passed',server:'passed'},
  source:{sha256:request[`${lane}Tree`]},fullTrackedCheckoutClean:true,errors:[],pageErrors:[],
  runtimeLedger:{state:'finished',errors:[],eventErrors:[],lateEvents:[],requests:[{state:'body-completed'}],generations:[{state:'sealed'},{state:'sealed'}]},
  drawer:drawerSequence.map(value=>{const [model,panel]=value.split(':');return {model,panel,checks:[{label:'required check',passed:true}],...(panel==='route-unmount'?{}:{settled:{dialog:{x:0,y:0,width:320,height:526},controls:[{tag:'BUTTON',label:'Close panel',disabled:false,rect:{x:268,y:62,width:44,height:44}}]}})};}),drawerFailures:[],
  animationDiagnostics:drawerOpenings.map((panel,i)=>({panel,status:'settled',startedAt:i*1000+3,elapsedMs:300,originalDeadlineMs:5000})),
  openingActions:drawerOpenings.map((panel,i)=>({panel,status:'returned',actionStartMs:i*1000+1,clickReturnMs:i*1000+2,clickDurationMs:1})),
  captures:drawerCaptures.map((label,i)=>({label,status:'captured',sha256:'e'.repeat(64),originalDeadlineMs:45000,actionStartMs:i*1000+400,captureStartMs:i*1000+401,captureReturnMs:i*1000+421,observationEndMs:i*1000+422,captureDurationMs:20,observationDurationMs:22,styles:{sheet:{background:lane==='baseline'?'rgba(23, 27, 30, 0.922)':'rgb(23, 27, 30)',backdropFilter:lane==='baseline'?'blur(30px)':'none',opacity:'1'},backdrop:{background:'rgba(5, 8, 9, 0.4)',backdropFilter:'none'}}})),
  trace:{elapsedMs:1000},workload:{sha256:'d'.repeat(64)}
}));
test('scrim-only request pins one source and the closed four-view candidate scope',()=>{
  for(const viewport of ['desktop','narrow','short','reduced'])assert.equal(validateScrimRequest(request,{...env,R35_DRAWER_VIEWPORT:viewport}).name,viewport);
  for(const patch of [{allow:false},{version:2},{contract:'drawer-opaque-compositing-v2'},{candidateTree:scrimBaseTree},{candidateTree:'a'.repeat(64)},{baselineCommit:'a'.repeat(40)},{origin:'https://example.test'}])assert.throws(()=>validateScrimRequest({...request,...patch},env));
  for(const patch of [{GITHUB_SHA:scrimBaseCommit},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_ACTIONS:undefined},{R35_DRAWER_VIEWPORT:'mobile'},{R35_DRAWER_CANDIDATE_ONLY:undefined},{R35_DRAWER_SCRIM_ONLY:'0'},{R35_DRAWER_URL:'https://example.test'},{R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-desktop-only]'},{R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-scrim-only] [release-any]'}])assert.throws(()=>validateScrimRequest(request,{...env,...patch}));
});
test('explicit profile selection never repurposes the old cc request or default assessment',async()=>{
  const profile=selectDrawerProfile(env);assert.equal(profile.requestPath,'qa/drawer-scrim-request.json');assert.equal(profile.validate,validateScrimRequest);assert.equal(profile.assess,assessScrimCandidate);
  const old=selectDrawerProfile({});assert.equal(old.requestPath,'qa/drawer-compositing-request.json');assert.equal(old.validate,validateDrawerRequest);assert.equal(old.assess,assessCandidateDrawerLane);
  assert.throws(()=>selectDrawerProfile({...env,R35_DRAWER_CANDIDATE_ONLY:undefined}));assert.throws(()=>selectDrawerProfile({...env,R35_DRAWER_SCRIM_ONLY:'any'}));assert.throws(()=>validateDrawerRequest(request,env));
  const oldRequest=JSON.parse(await readFile(new URL('../qa/drawer-compositing-request.json',import.meta.url),'utf8'));assert.equal(oldRequest.candidateTree,scrimBaseTree);assert.equal(oldRequest.contract,'drawer-opaque-compositing-v2');
});
test('scrim assessment retains source, timing, visual and cleanup failures without comparative evidence',()=>{
  const candidate=fixture()[1];assert.deepEqual(assessScrimCandidate(candidate,request),{status:'passed',scope:'candidate-only-scrim-treatment',comparable:false,failures:[],contract:scrimContract});
  assert.equal(assessCandidateDrawerLane(candidate,request).status,'failed','Old blur4 profile cannot pass a no-filter capture');
  for(const mutate of [row=>row.contract='drawer-desktop-candidate-only-v1',row=>row.source.sha256=scrimBaseTree,row=>row.captures[0].styles.backdrop.backdropFilter='blur(4px)',row=>row.captures[0].styles.backdrop.background='rgba(5, 8, 9, 0.2)',row=>row.cleanup.browser='failed',row=>row.runtimeLedger.state='open',row=>row.drawer[0].checks[0].passed=false,row=>row.animationDiagnostics[0].elapsedMs=5001,row=>{row.captures[0].observationDurationMs=45001;row.captures[0].observationEndMs=row.captures[0].actionStartMs+45001;},row=>row.openingActions[0].clickReturnMs=NaN]) {
    const row=fixture()[1];mutate(row);const result=assessScrimCandidate(row,request);assert.equal(result.status,'failed');assert.equal(result.comparable,false);
  }
});
test('scrim workflow has no baseline checkout and keeps the four fixed viewports and actual candidate child',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/drawer-scrim-candidate-qa.yml',import.meta.url),'utf8');
  assert.match(workflow,/viewport: \[desktop, narrow, short, reduced\]/);assert.doesNotMatch(workflow,/baseline-app|workflow_dispatch|release-marker/);assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);assert.match(workflow,/node scripts\/drawer-compositing-browser.mjs/);
  const driver=await readFile(new URL('../scripts/drawer-compositing-browser.mjs',import.meta.url),'utf8');assert.match(driver,/request=JSON.parse\(await readFile\(profile.requestPath/);assert.match(driver,/report.assessment=profile.assess\(report.lanes\[0\],request\)/);assert.match(driver,/monitorEventLoopDelay\(\{resolution:100\}\)/);
});
