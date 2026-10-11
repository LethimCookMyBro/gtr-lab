/** Closed v2 CSS-only comparison. Original v1 requests and verdicts remain unchanged. */
import assert from 'node:assert/strict';
import { viewports } from './ui-optimization-policy.mjs';
export const drawerBaselineCommit='8ad20d9280ac56cb77fd78df2c63eb105ebdc0a4';
export const drawerBaselineTree='3cc14885944d21ec3c934a0c36d468b064225f0c24ade0870f24566dedb0507b';
export const drawerCandidateTree='cc9236f314433e932c765c67cfe8f9a2912f47bf9995bee92fb2847c7f2e33b3';
export const drawerContract='drawer-opaque-compositing-v2';
export const drawerSequence=['nismo:Environment','nismo:Camera','nismo:route-unmount','premium:Environment','premium:Camera','premium:route-unmount'];
export const drawerOpenings=['Environment','Environment','Camera','Camera','Switch model','Environment','Environment','Camera','Camera','Switch model'];
export const drawerCaptures=['nismo-environment-settled','nismo-environment-bottom','nismo-camera-settled','premium-environment-focus-settled','premium-environment-bottom','premium-camera-settled'];
function colorMatches(value,channels,alpha) {
  const match=typeof value==='string'&&value.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
  return !!match&&channels.every((c,i)=>Number(match[i+1])===c)&&Math.abs(Number(match[4]??1)-alpha)<.002;
}
export function validateDrawerRequest(request,env) {
  assert.deepEqual(Object.keys(request).sort(),['allow','baselineCommit','baselineTree','candidateTree','contract','version'].sort());
  assert.equal(request.version,2);assert.equal(request.allow,true);assert.equal(request.contract,drawerContract);
  assert.equal(request.baselineCommit,drawerBaselineCommit);assert.equal(request.baselineTree,drawerBaselineTree);
  assert.equal(request.candidateTree,drawerCandidateTree);
  assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_EVENT_NAME,'push');
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.GITHUB_SHA,drawerBaselineCommit);
  assert.equal(env.R35_ALLOW_DRAWER_COMPOSITING,'1');assert.ok(env.R35_DRAWER_COMMIT_MESSAGE?.includes('[stage-drawer-compositing]'));assert.ok(!env.R35_DRAWER_COMMIT_MESSAGE?.includes('[release-'));
  assert.ok(Object.hasOwn(viewports,env.R35_DRAWER_VIEWPORT));
  for(const key of ['R35_UI_URL','R35_UI_ROOT','R35_SOURCE_SHA','HOME_QA_URL','R35_DRAWER_URL','R35_DRAWER_ROOT'])assert.equal(env[key],undefined);
  return {...viewports[env.R35_DRAWER_VIEWPORT],name:env.R35_DRAWER_VIEWPORT,origin:'http://127.0.0.1:4189'};
}
export function assessDrawerLanes(lanes,request) {
  const failures=[];
  if(!Array.isArray(lanes)||lanes.length!==2)return {status:'failed',comparable:false,failures:['Both independent lanes are mandatory']};
  for(const [index,name] of ['baseline','candidate'].entries()) {
    const row=lanes[index];
    if(row?.lane!==name){failures.push(`${name}: missing or out-of-order lane`);continue;}
    if(row.status!=='passed'||row.process?.exitCode!==0||row.process?.timedOut||row.process?.signal||row.process?.spawnError||row.process?.ownershipRetired!==true)failures.push(`${name}: lane/process did not pass or ownership retirement is unproven`);
    if(!row.cleanup||['context','browser','server'].some(key=>row.cleanup[key]!=='passed'))failures.push(`${name}: cleanup did not complete`);
    if(row.source?.sha256!==request[`${name}Tree`]||row.fullTrackedCheckoutClean!==true)failures.push(`${name}: source identity missing or wrong`);
    if(!/^[a-f0-9]{40}$/.test(row.harnessCommit??'')||row.harnessCommit===drawerBaselineCommit||row.commit!==(name==='baseline'?drawerBaselineCommit:row.harnessCommit)||row.harnessCommit!==lanes[1]?.harnessCommit)failures.push(`${name}: actual checkout revision missing or wrong`);
    if(!Array.isArray(row.errors)||row.errors.length||!Array.isArray(row.pageErrors)||row.pageErrors.length)failures.push(`${name}: execution errors`);
    const ledger=row.runtimeLedger;
    if(!ledger||ledger.state!=='finished'||!Array.isArray(ledger.errors)||ledger.errors.length||!Array.isArray(ledger.eventErrors)||ledger.eventErrors.length||!Array.isArray(ledger.lateEvents)||ledger.lateEvents.length||!Array.isArray(ledger.requests)||!ledger.requests.length||ledger.requests.some(r=>r.state!=='body-completed')||!Array.isArray(ledger.generations)||ledger.generations.length!==2||ledger.generations.some(d=>d.state!=='sealed'))failures.push(`${name}: original request ledger incomplete`);
    if(!Array.isArray(row.drawer)||JSON.stringify(row.drawer.map(d=>`${d.model}:${d.panel}`))!==JSON.stringify(drawerSequence)||row.drawer.some(d=>!Array.isArray(d.checks)||!d.checks.length||d.checks.some(check=>check.passed!==true))||!Array.isArray(row.drawerFailures)||row.drawerFailures.length)failures.push(`${name}: exact Drawer sequence did not pass`);
    if(!Array.isArray(row.animationDiagnostics)||JSON.stringify(row.animationDiagnostics.map(d=>d.panel))!==JSON.stringify(drawerOpenings)||row.animationDiagnostics.some(d=>d.status!=='settled'||d.originalDeadlineMs!==5000||!Number.isFinite(d.startedAt)||!Number.isFinite(d.elapsedMs)||d.elapsedMs<0||d.elapsedMs>5000))failures.push(`${name}: opening checkpoints incomplete or over original deadline`);
    if(!Array.isArray(row.openingActions)||JSON.stringify(row.openingActions.map(d=>d.panel))!==JSON.stringify(drawerOpenings)||row.openingActions.some((d,i)=>d.status!=='returned'||!Number.isFinite(d.actionStartMs)||!Number.isFinite(d.clickReturnMs)||!Number.isFinite(d.clickDurationMs)||d.clickReturnMs<d.actionStartMs||d.clickDurationMs!==d.clickReturnMs-d.actionStartMs||d.clickReturnMs>row.animationDiagnostics?.[i]?.startedAt||(i>0&&d.actionStartMs<row.openingActions[i-1].clickReturnMs)))failures.push(`${name}: actual opening action observations missing or unordered`);
    if(!Array.isArray(row.captures)||JSON.stringify(row.captures.map(d=>d.label))!==JSON.stringify(drawerCaptures))failures.push(`${name}: required captures incomplete`);
    else for(const [index,capture] of row.captures.entries()) {
      const sheet=capture.styles?.sheet,backdrop=capture.styles?.backdrop;
      const times=[capture.actionStartMs,capture.captureStartMs,capture.captureReturnMs,capture.observationEndMs];
      if(capture.status!=='captured'||!/^[a-f0-9]{64}$/.test(capture.sha256??'')||times.some((time,i)=>!Number.isFinite(time)||(i>0&&time<times[i-1]))||(index>0&&capture.actionStartMs<row.captures[index-1].observationEndMs)||capture.originalDeadlineMs!==45000||!Number.isFinite(capture.captureDurationMs)||capture.captureDurationMs!==capture.captureReturnMs-capture.captureStartMs||!Number.isFinite(capture.observationDurationMs)||capture.observationDurationMs!==capture.observationEndMs-capture.actionStartMs||capture.observationDurationMs>45000)failures.push(`${name}: screenshot receipt or observation incomplete, unordered or over original deadline`);
      if(!colorMatches(sheet?.background,[23,27,30],name==='baseline'?235/255:1)||sheet?.backdropFilter!==(name==='baseline'?'blur(30px)':'none')||sheet?.opacity!=='1'||!colorMatches(backdrop?.background,[5,8,9],.4)||backdrop?.backdropFilter!=='blur(4px)')failures.push(`${name}: expected sheet/backdrop treatment not observed`);
    }
    if(!row.trace||!Number.isFinite(row.trace.elapsedMs)||row.trace.elapsedMs<=0)failures.push(`${name}: trace evidence missing`);
  }
  if(lanes[0].workload?.sha256!==lanes[1].workload?.sha256||!lanes[0].workload?.sha256)failures.push('Exact non-bundle workloads differ or are missing');
  const comparable=failures.length===0;
  if(comparable)for(let i=0;i<drawerSequence.length;i++) {
    const a=lanes[0].drawer[i].settled,b=lanes[1].drawer[i].settled;
    if(drawerSequence[i].endsWith(':route-unmount'))continue;
    if(!a||!b){failures.push(`${drawerSequence[i]}: settled evidence missing`);continue;}
    for(const key of ['x','y','width','height'])if(!Number.isFinite(a.dialog?.[key])||!Number.isFinite(b.dialog?.[key])||Math.abs(a.dialog[key]-b.dialog[key])>1.1)failures.push(`${drawerSequence[i]}: dialog geometry ${key} differs`);
    if(!Array.isArray(a.controls)||!a.controls.length||!Array.isArray(b.controls)||a.controls.length!==b.controls.length){failures.push(`${drawerSequence[i]}: controls differ`);continue;}
    for(let j=0;j<a.controls.length;j++) {
      const x=a.controls[j],y=b.controls[j];
      if(x.tag!==y.tag||x.label!==y.label||x.disabled!==y.disabled)failures.push(`${drawerSequence[i]}: control identity differs`);
      for(const key of ['x','y','width','height'])if(!Number.isFinite(x.rect?.[key])||!Number.isFinite(y.rect?.[key])||Math.abs(x.rect[key]-y.rect[key])>1.1)failures.push(`${drawerSequence[i]}: control geometry ${key} differs`);
    }
  }
  return {status:failures.length?'failed':'passed',comparable:comparable&&failures.length===0,failures};
}
