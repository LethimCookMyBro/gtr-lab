/** Additive exact public-origin contract. Historical candidate eligibility is unchanged. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {sourceIdentity} from './ui-optimization-policy.mjs';
import {readFormulaEAssets, formulaEBuildIdentity} from './formula-e-live-contract.mjs';
import {createRuntimeBodyLedger} from './cabin-runtime-body-ledger.mjs';
import {readinessWindow} from './cabin-preparation-policy.mjs';
import {hash, deriveStudyLiveTest, deriveStudyLiveNetwork} from './integrated-study-live-derive.mjs';
export const ORIGIN='https://gtr-lab-production.up.railway.app';
export const ACCEPTED_BUILD='b94f7ccfcc4cb58e06f73653fc2e3093dc29083b790f1c41c9c8a40114b36c36';
export const ACCEPTED_COMMIT='0565727177dc549f52a3181bface65c6582a0fcb';
export const SOURCE='a742f29926561f8c6b1e7256dc3c71d54ec10792ace219c5fbbeb330ad74310a';
export function validateStudyLiveRequest(request) {
  assert.deepEqual(Object.keys(request??{}).sort(),['version','allow','origin','expectedDeployedCommit','railwayDeploymentId','buildSha256'].sort());
  assert.equal(request.version,1); assert.equal(request.allow,true,'Live verification inactive pending independent deployment readback');
  assert.equal(request.origin,ORIGIN);
  assert.match(request.expectedDeployedCommit??'',/^(?!0{40}$)[a-f0-9]{40}$/);
  assert.match(request.railwayDeploymentId??'',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(request.buildSha256,ACCEPTED_BUILD,'Exact accepted owner-built HTML/JS/CSS identity');
  return request;
}
export function validateStudyLiveEnvironment(env) {
  for(const [key,value] of Object.entries({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',R35_STUDY_LIVE:'1'})) assert.equal(env[key],value,key);
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
  assert.ok(env.R35_STUDY_LIVE_MESSAGE?.includes('[verify-integrated-r35-study-live]'));
  assert.ok(!env.R35_STUDY_LIVE_MESSAGE.includes('[release-'));
  // Installed Playwright 1.63.0 runner sets this exact marker before global setup.
  // It selects no target, browser, timeout or execution budget. CPU preflight omits it.
  if(Object.hasOwn(env,'PLAYWRIGHT_TEST')) assert.equal(env.PLAYWRIGHT_TEST,'1','Exact installed Playwright Test runtime marker');
  for(const key of Object.keys(env)) if(/^(R35_|PLAYWRIGHT_|STUDY_)/.test(key)) assert.ok(['R35_STUDY_LIVE','R35_STUDY_LIVE_MESSAGE','PLAYWRIGHT_TEST'].includes(key),`No live target/browser/budget override: ${key}`);
}
export async function verifyStudyLiveSource(root,env) {
  validateStudyLiveEnvironment(env);
  const read=path=>readFile(resolve(root,path));
  const request=validateStudyLiveRequest(JSON.parse(await read('qa/integrated-study-live-request.json')));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),env.GITHUB_SHA);
  assert.equal(git('status','--porcelain','--untracked-files=no'),'','Clean tracked live harness required');
  git('merge-base','--is-ancestor',ACCEPTED_COMMIT,request.expectedDeployedCommit);
  git('merge-base','--is-ancestor',request.expectedDeployedCommit,'HEAD');
  const pinBytes=await read('qa/integrated-study-live-source-pins.json');
  assert.equal(hash(pinBytes),'bab8eaa014166cbac3938870f467cd490689ec0513cb7bef67aab6f60054f27d','Reviewed dependency closure manifest');
  const pins=JSON.parse(pinBytes);
  for(const [path,sha256] of Object.entries(pins)) {
    git('ls-files','--error-unmatch',path);
    assert.equal(hash(await read(path)),sha256,`Reviewed QA dependency drift: ${path}`);
  }
  for(const [target,input,derive] of [
    ['e2e/integrated-r35-study-live.spec.ts','e2e/integrated-r35-study.spec.ts',deriveStudyLiveTest],
    ['scripts/integrated-study-live-network.mjs','scripts/integrated-study-network.mjs',deriveStudyLiveNetwork],
  ]) assert.equal(String(await read(target)),derive(await read(input)),`Exact derived adapter drift: ${target}`);
  const source=await sourceIdentity(root);
  assert.equal(source.sha256,SOURCE); assert.equal(source.files.length,112);
  const assets=await readFormulaEAssets(resolve(root,'dist'));
  const build=formulaEBuildIdentity(assets); assert.equal(build.sha256,request.buildSha256);
  return {harnessCommit:env.GITHUB_SHA,acceptedCommit:ACCEPTED_COMMIT,request,source,build,assets};
}
/** One actual main document per unchanged study test. Bodies belong to issued Request objects. */
export function observeStudyLiveAppBodies(page,pins,report={}) {
  const ledger=createRuntimeBodyLedger({intendedAssets:pins});
  const requests=new Map(),errors=[]; let sequence=0,documentSeen=false;
  const guard=work=>{try{work();}catch(error){errors.push(String(error));}};
  const onRequest=request=>guard(()=>{
    if(!['document','script','stylesheet'].includes(request.resourceType())) return;
    const url=new URL(request.url());
    assert.equal(url.origin,ORIGIN,'Application request escaped fixed origin');
    assert.equal(request.redirectedFrom(),null,'No application redirects');
    let path=url.pathname;
    if(request.resourceType()==='document') {
      assert.equal(request.frame(),page.mainFrame());
      assert.equal(documentSeen,false,'Unexpected hard navigation'); documentSeen=true;
      assert.equal(path,'/configurator/premium'); assert.equal(url.search,'?study=2008');
      path='/index.html'; ledger.beginDocument(1);
    } else { assert.equal(url.search,''); assert.ok(pins.has(path),'Unpinned application bundle'); }
    const id=++sequence; requests.set(request,id);
    ledger.issue({requestId:id,generation:1,url:request.url(),path,phase:'integrated-study-live',startedAt:performance.now()});
  });
  const onResponse=response=>guard(()=>{
    const id=requests.get(response.request()); if(!id)return;
    ledger.receive({requestId:id,generation:1,url:response.url(),status:response.status(),body:()=>response.body()});
  });
  const onFailed=request=>guard(()=>{const id=requests.get(request);if(id)ledger.fail({requestId:id,generation:1,error:request.failure()?.errorText});});
  page.on('request',onRequest);page.on('response',onResponse);page.on('requestfailed',onFailed);
  return {async finish() {
    try {
    await ledger.finish({window:readinessWindow(15000)});
    assert.deepEqual(errors,[]); const result=ledger.snapshot();
    assert.equal(result.state,'finished');
    for(const kind of ['html','js','css']) assert.ok(result.requests.some(row=>row.state==='body-completed'&&row.path.endsWith('.'+kind)),`Missing actual ${kind} response body`);
    return result;
    } finally {report.appBodies={...ledger.snapshot(),eventErrors:[...errors]};}
  }};
}
