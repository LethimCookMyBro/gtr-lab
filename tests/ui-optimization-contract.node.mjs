import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { baselineCommit, contract, validateRequest, compareSnapshots, summarizeTrace } from '../scripts/ui-optimization-policy.mjs';
const request={version:1,allow:true,contract,baselineCommit,baselineTree:'a'.repeat(64),candidateTree:'b'.repeat(64)};
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'c'.repeat(40),R35_ALLOW_UI_OPTIMIZATION_QA:'1',R35_UI_COMMIT_MESSAGE:'QA [stage-ui-optimization]',R35_UI_VIEWPORT:'mobile'};
test('closed request accepts exactly five fixed staged viewports',()=>{
  for(const name of ['desktop','mobile','short','narrow','reduced']) assert.equal(validateRequest(request,{...env,R35_UI_VIEWPORT:name}).origin,'http://127.0.0.1:4189');
  for(const changed of [{allow:false},{version:2},{contract:'other'},{baselineCommit:'c'.repeat(40)},{candidateTree:'a'.repeat(64)},{origin:'https://example.test'},{baselineTree:'unbound'}]) assert.throws(()=>validateRequest({...request,...changed},env));
  for(const changed of [{GITHUB_ACTIONS:undefined},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_SHA:baselineCommit},{R35_ALLOW_UI_OPTIMIZATION_QA:undefined},{R35_UI_COMMIT_MESSAGE:'[release-any] [stage-ui-optimization]'},{R35_UI_COMMIT_MESSAGE:''},{R35_UI_VIEWPORT:'any'},{R35_UI_URL:'https://example.test'},{R35_UI_ROOT:'/tmp/other'},{R35_SOURCE_SHA:'c'.repeat(40)},{HOME_QA_URL:'http://localhost'}]) assert.throws(()=>validateRequest(request,{...env,...changed}));
});
test('native comparison rejects geometry, choreography, crop and missing checkpoint changes',()=>{
  const row={input:200,y:200,height:2000,overflow:false,activeEra:'0',nodes:[{key:'film',rect:{x:0,y:20,width:300,height:169},style:{opacity:'1',transform:'none',objectFit:'cover',objectPosition:'50% 50%',clipPath:'none'}}]};
  assert.deepEqual(compareSnapshots([row],[structuredClone(row)]),[]);
  for(const mutate of [v=>v[0].y+=3,v=>v[0].nodes[0].rect.width+=3,v=>v[0].nodes[0].style.transform='scale(0.8)',v=>v[0].nodes[0].style.objectPosition='20% 50%',v=>v.pop(),v=>v[0].y=NaN,v=>delete v[0].nodes[0].rect.height,v=>delete v[0].nodes[0].style.opacity,v=>v[0].activeEra='1',v=>v[0].nodes[0].key=undefined]) {const rows=[structuredClone(row)];mutate(rows);assert.ok(compareSnapshots([row],rows).length);}
});
test('trace summaries retain actual event counts and durations without FPS claims',()=>{
  const summary=summarizeTrace([{name:'Layout',ph:'X',dur:1400},{name:'Layout',ph:'X',dur:600},{name:'Paint',ph:'X',dur:3000},{name:'DrawFrame',ph:'I'}]);
  assert.deepEqual(summary.Layout,{count:2,durationMs:2});assert.deepEqual(summary.Paint,{count:1,durationMs:3});assert.deepEqual(summary.DrawFrame,{count:1,durationMs:0});assert.equal(summary.fps,undefined);
});
test('browser/server imports remain behind the closed CI and exact source gates',async()=>{
  const source=await readFile(new URL('../scripts/ui-optimization-browser.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf('validateRequest(request, env)')<source.indexOf("await import('@playwright/test')"));
  assert.ok(source.indexOf('await verifyCheckout(root, lane, request, env)')<source.indexOf("await import(pathToFileURL(resolve(root, 'server.mjs')))"));
  assert.doesNotMatch(source,/page\.route\(|route\.fulfill\(|reducedMotion: 'reduce'.*launch|scrollTo\(|setDefaultTimeout\(0\)|animations: 'disabled'/);
});

test('cleanup, complete tracked sources and equal workload remain hard acceptance gates',async()=>{
  const source=await readFile(new URL('../scripts/ui-optimization-browser.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("git(root,['status','--porcelain','--untracked-files=no'])"));
  assert.ok(source.includes("assert.deepEqual(workload,baselineWorkload"));
  for(const label of ['Browser context cleanup','Browser cleanup','Server cleanup'])assert.ok(source.includes(`'${label}').catch(error=>{row.status='failed';`));
  assert.ok(source.includes('stable>=2'));assert.ok(source.includes('Original 90-second total native-scroll script deadline'));assert.ok(source.includes('execution-order drift'));assert.ok(source.includes('Math.min(performance.now()+2000,scriptDeadline)'));
  assert.ok(source.includes('these snapshots themselves cause layout/computed-style reads'));
});
