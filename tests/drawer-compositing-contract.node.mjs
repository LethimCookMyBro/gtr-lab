import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { drawerBaselineCommit,drawerBaselineTree,drawerCandidateTree,drawerContract,drawerSequence,drawerOpenings,drawerCaptures,validateDrawerRequest,assessDrawerLanes,assessCandidateDrawerLane } from '../scripts/drawer-compositing-policy.mjs';
const request={version:2,allow:true,contract:drawerContract,baselineCommit:drawerBaselineCommit,baselineTree:drawerBaselineTree,candidateTree:drawerCandidateTree};
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),R35_ALLOW_DRAWER_COMPOSITING:'1',R35_DRAWER_COMMIT_MESSAGE:'QA [stage-drawer-compositing]',R35_DRAWER_VIEWPORT:'desktop'};
const fixture=()=>['baseline','candidate'].map(lane=>({
  lane,commit:lane==='baseline'?drawerBaselineCommit:env.GITHUB_SHA,harnessCommit:env.GITHUB_SHA,status:'passed',
  process:{exitCode:0,timedOut:false,signal:null,ownershipRetired:true},cleanup:{context:'passed',browser:'passed',server:'passed'},
  source:{sha256:request[`${lane}Tree`]},fullTrackedCheckoutClean:true,errors:[],pageErrors:[],
  runtimeLedger:{state:'finished',errors:[],eventErrors:[],lateEvents:[],requests:[{state:'body-completed'}],generations:[{state:'sealed'},{state:'sealed'}]},
  drawer:drawerSequence.map(value=>{const [model,panel]=value.split(':');return {model,panel,checks:[{label:'required check',passed:true}],...(panel==='route-unmount'?{}:{settled:{dialog:{x:0,y:0,width:320,height:526},controls:[{tag:'BUTTON',label:'Close panel',disabled:false,rect:{x:268,y:62,width:44,height:44}}]}})};}),drawerFailures:[],
  animationDiagnostics:drawerOpenings.map((panel,i)=>({panel,status:'settled',startedAt:i*1000+3,elapsedMs:300,originalDeadlineMs:5000})),
  openingActions:drawerOpenings.map((panel,i)=>({panel,status:'returned',actionStartMs:i*1000+1,clickReturnMs:i*1000+2,clickDurationMs:1})),
  captures:drawerCaptures.map((label,i)=>({label,status:'captured',sha256:'e'.repeat(64),originalDeadlineMs:45000,actionStartMs:i*1000+400,captureStartMs:i*1000+401,captureReturnMs:i*1000+421,observationEndMs:i*1000+422,captureDurationMs:20,observationDurationMs:22,styles:{sheet:{background:lane==='baseline'?'rgba(23, 27, 30, 0.922)':'rgb(23, 27, 30)',backdropFilter:lane==='baseline'?'blur(30px)':'none',opacity:'1'},backdrop:{background:'rgba(5, 8, 9, 0.4)',backdropFilter:'blur(4px)'}}})),
  trace:{elapsedMs:1000},workload:{sha256:'d'.repeat(64)}
}));
test('v2 pins only the approved8ad baseline and separate closed drawer scope',()=>{
  assert.equal(validateDrawerRequest(request,env).origin,'http://127.0.0.1:4189');
  for(const patch of [{version:1},{baselineCommit:'38f9f8c5e90619b961e70315d1683618cec92b88'},{baselineTree:'b'.repeat(64)},{candidateTree:drawerBaselineTree},{origin:'https://example.test'},{contract:'ui-optimization-native-choreography-v1'},{allow:false}])assert.throws(()=>validateDrawerRequest({...request,...patch},env));
  for(const patch of [{GITHUB_ACTIONS:undefined},{GITHUB_SHA:drawerBaselineCommit},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-compositing] [release-any]'},{R35_DRAWER_COMMIT_MESSAGE:'[stage-ui-optimization]'},{R35_DRAWER_ROOT:'/tmp/other'},{R35_DRAWER_VIEWPORT:'any'}])assert.throws(()=>validateDrawerRequest(request,{...env,...patch}));
});
test('only both complete matched lanes can pass or emit comparative metrics',()=>{
  assert.deepEqual(assessDrawerLanes(fixture(),request),{status:'passed',comparable:true,failures:[]});
  for(const mutate of [rows=>rows.shift(),rows=>rows.pop(),rows=>rows.reverse(),rows=>rows[0].status='failed',rows=>rows[1].status='failed',rows=>rows[0].cleanup.browser='failed',rows=>rows[0].process.exitCode=1,rows=>rows[1].process.timedOut=true,rows=>rows[1].source.sha256='wrong',rows=>rows[0].errors.push({message:'retained original failure'}),rows=>rows[0].runtimeLedger.state='open',rows=>rows[0].runtimeLedger.requests[0].state='issued',rows=>rows[1].runtimeLedger.generations[1].state='open',rows=>rows[1].runtimeLedger.lateEvents.push({}),rows=>rows[0].drawer.pop(),rows=>rows[0].drawerFailures.push('isolation failed'),rows=>rows[0].animationDiagnostics.pop(),rows=>rows[0].animationDiagnostics[0].status='failed',rows=>rows[1].captures.pop(),rows=>rows[0].trace=undefined,rows=>rows[1].workload.sha256='wrong',rows=>rows[1].drawer[0].settled.dialog.width=NaN,rows=>rows[1].drawer[0].settled.controls[0].rect.width=40,rows=>rows[0].drawer[0].checks[0].passed=false,rows=>rows[0].drawer[0].checks=[],rows=>rows[0].animationDiagnostics[0].elapsedMs=5001,rows=>rows[0].animationDiagnostics[0].elapsedMs=NaN,rows=>rows[0].captures[0].captureReturnMs=NaN,rows=>rows[0].captures[0].observationEndMs=100,rows=>{rows[0].captures[0].observationDurationMs=45001;rows[0].captures[0].observationEndMs=rows[0].captures[0].actionStartMs+45001;},rows=>rows[0].process.ownershipRetired=false,rows=>rows[0].process.signal='SIGKILL',rows=>rows[0].process.spawnError='failed',rows=>rows[0].cleanup.context='not-started',rows=>{rows[0].process.killed=true;rows[0].cleanup.browser='failed';},rows=>rows[1].commit=drawerBaselineCommit,rows=>rows[0].captures[0].styles.sheet.background='rgb(23, 27, 30)',rows=>rows[1].openingActions[0].status='failed',rows=>rows[1].openingActions[0].clickReturnMs=NaN,rows=>rows.forEach(row=>delete row.drawer[0].settled)]) {
    const rows=fixture();mutate(rows);const result=assessDrawerLanes(rows,request);assert.equal(result.status,'failed');assert.equal(result.comparable,false);assert.ok(result.failures.length);
  }
});
test('independent process driver has no baseline break and preserves all existing action budgets',async()=>{
  const driver=await readFile(new URL('../scripts/drawer-compositing-browser.mjs',import.meta.url),'utf8');
  assert.ok(driver.includes("spawn(process.execPath"));assert.ok(driver.includes("for(const lane of ['baseline','candidate'])"));assert.ok(driver.includes('if(report.assessment.comparable)report.metricComparison'));
  assert.doesNotMatch(driver,/if\([^\n]*failed[^\n]*\)break|page\.route\(|route\.fulfill\(|animations:'disabled'|process\.env\.GITHUB_SHA\s*=/);
  for(const evidence of ['timeout:45000','page.setDefaultTimeout(10000)','page.setDefaultNavigationTimeout(45000)','15000,`${name} cleanup`','16*60*1000','Direct-entry NISMO then Premium','earlier desktop stall'])assert.ok(driver.includes(evidence),evidence);
  const shared=await readFile(new URL('../scripts/ui-optimization-browser.mjs',import.meta.url),'utf8');assert.ok(shared.includes('originalDeadlineMs:5000'));assert.ok(shared.includes("},{timeout:5000}).toBe(0)"));assert.ok(shared.includes('timeout:90000'));
});

// The wrapper returns the real locator and preserves native call options/results/errors.
test('opening instrumentation observes the unchanged real Playwright click',async()=>{
  const {observeOpeningClicks}=await import('../scripts/drawer-compositing-browser.mjs');
  let calls=0,tick=0;const options={timeout:10000};const error=new Error('original action failure');
  const locator={click:async passed=>{assert.equal(passed,options);calls++;return 'native result';}};
  const page={getByRole(role,arg){assert.equal(role,'button');assert.equal(arg.name,'Environment');return locator;},evaluate(){assert.equal(this,page);return 'bound';}};
  const observations=[],observed=observeOpeningClicks(page,observations,()=>++tick);
  assert.equal(observed.getByRole('button',{name:'Environment',includeHidden:true}),locator);
  assert.equal(await locator.click(options),'native result');assert.equal(calls,1);assert.equal(observed.evaluate(),'bound');
  assert.deepEqual(observations,[{panel:'Environment',actionStartMs:1,clock:'Node performance.now',status:'returned',clickReturnMs:2,clickDurationMs:1}]);
  const badPage={getByRole:()=>({click:async()=>{throw error;}})};
  const bad=observeOpeningClicks(badPage,observations,()=>++tick).getByRole('button',{name:'Environment',includeHidden:true});
  await assert.rejects(bad.click(),value=>value===error);assert.equal(observations[1].status,'failed');assert.equal(observations[1].clickDurationMs,1);
});

test('baseline failure or exception still executes the independent candidate exactly once',async()=>{
  const {collectIndependentLanes}=await import('../scripts/drawer-compositing-browser.mjs');
  for(const throws of [false,true]) {
    const called=[],saved=[];
    const rows=await collectIndependentLanes(async lane=>{called.push(lane);if(lane==='baseline'&&throws)throw new Error('original baseline failure');return {lane,status:lane==='baseline'?'failed':'passed'};},async row=>saved.push(row));
    assert.deepEqual(called,['baseline','candidate']);assert.equal(saved.length,2);assert.equal(rows[0].status,'failed');assert.equal(rows[1].status,'passed');assert.equal(assessDrawerLanes(rows,request).status,'failed');
    if(throws)assert.match(rows[0].errors[0].message,/original baseline failure/);
  }
});

test('late styles cannot start a screenshot or overwrite an original capture timeout',async()=>{
  const {recordDrawerCapture}=await import('../scripts/drawer-compositing-browser.mjs');
  for(const lateStage of ['styles','screenshot']) {
    let time=0,timer,resolveLate,calls=0;const capture={label:'required'};
    const late=new Promise(resolve=>{resolveLate=resolve;});
    const task=recordDrawerCapture({capture,now:()=>time,setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{},readStyles:()=>lateStage==='styles'?late:Promise.resolve({sheet:{}}),screenshot:()=>{calls++;return late;}});
    await Promise.resolve();time=45000;timer();await assert.rejects(task,/original 45000ms deadline/);
    const frozen=JSON.stringify(capture);resolveLate(lateStage==='styles'?{sheet:{}}:Buffer.from('late original screenshot'));
    await Promise.resolve();await Promise.resolve();assert.equal(JSON.stringify(capture),frozen);assert.equal(capture.status,'failed');assert.equal(capture.sha256,undefined);assert.equal(calls,lateStage==='styles'?0:1);
  }
});
test('normal failed lane can prove retirement without passing functional acceptance',async()=>{
  const {ownershipRetired}=await import('../scripts/drawer-compositing-browser.mjs');
  const cleanup={context:'passed',browser:'passed',server:'passed'};
  for(const exitCode of [0,1])assert.equal(ownershipRetired({exitCode,timedOut:false,signal:null},cleanup),true);
  for(const process of [{exitCode:2},{exitCode:null},{exitCode:1,timedOut:true},{exitCode:1,signal:'SIGTERM'},{exitCode:1,spawnError:'original error'}])assert.equal(ownershipRetired(process,cleanup),false);
  for(const name of ['context','browser','server'])assert.equal(ownershipRetired({exitCode:1},{...cleanup,[name]:'failed'}),false);
  const rows=fixture();rows[0].status='failed';rows[0].process.exitCode=1;rows[0].process.ownershipRetired=ownershipRetired(rows[0].process,rows[0].cleanup);
  assert.equal(rows[0].process.ownershipRetired,true);assert.equal(assessDrawerLanes(rows,request).status,'failed');assert.equal(assessDrawerLanes(rows,request).comparable,false);
});

test('candidate-only desktop validates a real single lane without fabricating a baseline',()=>{
  const onlyEnv={...env,R35_DRAWER_CANDIDATE_ONLY:'1',R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-desktop-only]'};
  assert.equal(validateDrawerRequest(request,onlyEnv).name,'desktop');
  for(const patch of [{R35_DRAWER_VIEWPORT:'mobile'},{R35_DRAWER_CANDIDATE_ONLY:'any'},{R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-compositing]'}])assert.throws(()=>validateDrawerRequest(request,{...onlyEnv,...patch}));
  assert.throws(()=>validateDrawerRequest(request,{...env,R35_DRAWER_COMMIT_MESSAGE:'[stage-drawer-desktop-only]'}));
  const candidate=fixture()[1];assert.deepEqual(assessCandidateDrawerLane(candidate,request),{status:'passed',scope:'candidate-only',comparable:false,failures:[]});
  for(const mutate of [row=>row.lane='baseline',row=>row.status='failed',row=>row.cleanup.browser='failed',row=>row.process.exitCode=1,row=>row.process.ownershipRetired=false,row=>row.runtimeLedger.state='open',row=>row.drawer[0].checks[0].passed=false,row=>row.captures[0].captureReturnMs=NaN,row=>row.animationDiagnostics[0].elapsedMs=5001,row=>row.source.sha256=drawerBaselineTree,row=>row.workload=undefined,row=>delete row.drawer[0].settled,row=>row.drawer[0].settled.dialog.width=NaN,row=>row.drawer[0].settled.controls=[]]) {
    const row=fixture()[1];mutate(row);const result=assessCandidateDrawerLane(row,request);assert.equal(result.status,'failed');assert.equal(result.comparable,false);
  }
});
test('standalone desktop entry starts only the real candidate child and emits no comparative metric',async()=>{
  const source=await readFile(new URL('../scripts/drawer-compositing-browser.mjs',import.meta.url),'utf8');
  const standalone=source.slice(source.indexOf('export async function mainCandidateOnly'),source.indexOf('if(process.argv[1]'));
  assert.match(standalone,/runLaneProcess\('candidate',target,performance.now\(\)\+8\*60\*1000\)/);assert.doesNotMatch(standalone,/runLaneProcess\('baseline'|metricComparison\s*=/);
  assert.match(source,/if\(env.R35_DRAWER_CANDIDATE_ONLY==='1'\)assert.equal\(lane,'candidate'/);
  assert.match(source,/sample.nodeObservedAtMs=now\(\)/);assert.match(source,/loopDelay\?\.enable\(\)/);assert.match(source,/loopDelay.disable\(\)/);
});

test('late diagnostic receipt is labeled without changing original predicate failure or deadline',async()=>{
  const {annotateDiagnosticReceipts}=await import('../scripts/drawer-compositing-browser.mjs');
  const diagnostic={status:'failed',startedAt:100,originalDeadlineMs:5000,elapsedMs:5700,originalError:'original timeout',samples:[{at:900,animations:[]}]};const seen=new WeakSet();
  annotateDiagnosticReceipts([diagnostic],seen,()=>5800);assert.equal(diagnostic.status,'failed');assert.equal(diagnostic.originalError,'original timeout');assert.equal(diagnostic.originalDeadlineMs,5000);assert.equal(diagnostic.samples[0].observedWithinOriginalPredicateWindow,false);assert.equal(diagnostic.samples[0].observedAfterPredicateFailure,true);
  const frozen=JSON.stringify(diagnostic);annotateDiagnosticReceipts([diagnostic],seen,()=>9000);assert.equal(JSON.stringify(diagnostic),frozen);
});
