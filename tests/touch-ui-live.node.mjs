/** Direct CPU-only checks. No browser, test server, network or local sockets. */
import test from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TOUCH_UI_BASELINE, TOUCH_UI_CONTRACT, TOUCH_UI_VIEWPORTS, validateTouchRequest, validateTouchCI, assertTouchSource, assertTouchBuild, assessTouchGesture, createTouchRuntimeEvidence, assertTouchRuntimeRequest, assertTouchRuntimeComplete } from '../scripts/touch-ui-live-contract.mjs';
const request = ()=>({version:1,allow:true,contract:TOUCH_UI_CONTRACT,mode:'baseline-live',target:{...TOUCH_UI_BASELINE}});
const env = ()=>({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),TOUCH_UI_ALLOW:'1',TOUCH_UI_COMMIT_MESSAGE:'QA [verify-touch-ui-live]',TOUCH_UI_VIEWPORT:'tablet-768',TOUCH_UI_AREA:'home-collection'});
const candidate = ()=>({...request(),mode:'candidate-ci',target:{origin:'http://127.0.0.1:4173',sourceTree:'b'.repeat(64),sourceFiles:103}});
test('exact requested phone/tablet/landscape/desktop grid retains genuine touch contexts',()=>{
  assert.deepEqual(TOUCH_UI_VIEWPORTS.map(v=>[v.width,v.height,v.touch]),[[320,568,true],[390,844,true],[768,1024,true],[820,1180,true],[1024,768,true],[1440,900,false]]);
});
test('public baseline pins are the reviewed release request, never discovered from HTTP',async()=>{
  assert.deepEqual(JSON.parse(await readFile('qa/formula-e-live-request.json','utf8')),TOUCH_UI_BASELINE);
  assert.deepEqual(JSON.parse(await readFile('qa/touch-ui-live-request.json','utf8')),request());
  validateTouchRequest(request());validateTouchCI(request(),env());
});
for(const [name,change] of Object.entries({inactive:{allow:false},unknown:{skipReadiness:true},origin:{target:{...TOUCH_UI_BASELINE,origin:'https://example.com'}},source:{target:{...TOUCH_UI_BASELINE,sourceTree:'b'.repeat(64)}},commit:{target:{...TOUCH_UI_BASELINE,expectedDeployedCommit:'b'.repeat(40)}},build:{target:{...TOUCH_UI_BASELINE,buildSha256:'b'.repeat(64)}},mode:{mode:'custom'}})) test(`rejects changed baseline ${name}`,()=>assert.throws(()=>validateTouchRequest({...request(),...change})));
for(const [name,change] of Object.entries({local:{CI:'false'},notGithub:{GITHUB_ACTIONS:'false'},foreignRepo:{GITHUB_REPOSITORY:'other/repo'},branch:{GITHUB_REF:'refs/heads/other'},event:{GITHUB_EVENT_NAME:'workflow_dispatch'},sha:{GITHUB_SHA:'main'},inactive:{TOUCH_UI_ALLOW:'0'},token:{TOUCH_UI_COMMIT_MESSAGE:'ordinary'},release:{TOUCH_UI_COMMIT_MESSAGE:'[verify-touch-ui-live] [release-test]'},viewport:{TOUCH_UI_VIEWPORT:'unknown'},area:{TOUCH_UI_AREA:'unknown'},override:{TOUCH_UI_ORIGIN:'http://127.0.0.1:4173'}})) test(`rejects unreviewed invocation ${name}`,()=>assert.throws(()=>validateTouchCI(request(),{...env(),...change})));
test('candidate uses separately checked-in exact source and fixed CI-only origin',()=>{
  validateTouchRequest(candidate());validateTouchCI(candidate(),{...env(),TOUCH_UI_COMMIT_MESSAGE:'QA [stage-touch-ui]'});
  assert.throws(()=>validateTouchCI(candidate(),env()));
  assert.throws(()=>validateTouchRequest({...candidate(),target:{...candidate().target,origin:TOUCH_UI_BASELINE.origin}}));
  assert.throws(()=>validateTouchRequest({...candidate(),target:{...candidate().target,sourceTree:TOUCH_UI_BASELINE.sourceTree}}));
  assertTouchSource({sha256:'b'.repeat(64),files:Array(103)},candidate());
  assert.throws(()=>assertTouchSource({sha256:'a'.repeat(64),files:Array(103)},candidate()));
  assert.throws(()=>assertTouchSource({sha256:'b'.repeat(64),files:Array(102)},candidate()));
});
test('candidate bytes are derived from source-bound local build while live hash cannot drift',()=>{
  const bytes=Buffer.from('cpu fixture'),pin={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const assets=new Map(['/index.html','/assets/app.js','/assets/app.css'].map(path=>[path,pin]));
  assert.match(assertTouchBuild(assets,candidate()).sha256,/^[a-f0-9]{64}$/);
  assert.throws(()=>assertTouchBuild(assets,request()));
});
const gesture=()=>({touch:true,direction:'forward',kind:'native-cdp-touch',before:{position:0,max:1000},after:{position:220},observed:['touchstart','touchmove','touchend'].map(type=>({type,trusted:true}))});
test('touch receipts require trusted native start/move/end and observed directional scrolling',()=>{
  assert.deepEqual(assessTouchGesture(gesture()),[]);
  for(const changed of [{after:{position:0}},{after:{position:-220}},{observed:[]},{observed:gesture().observed.map(event=>({...event,trusted:false}))},{kind:'no-scroll-required'}]) assert.ok(assessTouchGesture({...gesture(),...changed}).length);
  assert.deepEqual(assessTouchGesture({...gesture(),kind:'no-scroll-required',before:{position:0,max:0},after:undefined}),[]);
  assert.deepEqual(assessTouchGesture({...gesture(),direction:'backward',before:{position:220,max:1000},after:{position:0}}),[]);
});
test('workflow isolates independent page jobs, reuses one build, and has no release writes',async()=>{
  const workflow=await readFile('.github/workflows/touch-ui-live.yml','utf8');
  for(const required of ['fail-fast: false','max-parallel: 6','area: [home-collection, configurator]','actions/download-artifact@v4','contents: read','if: always()']) assert.ok(workflow.includes(required));
  assert.doesNotMatch(workflow,/contents: write|git push|railway (?:up|deploy)/);
  const config=await readFile('playwright.touch-ui.config.ts','utf8');
  assert.match(config,/retries: 0/);assert.match(config,/timeout: 30_000/);assert.match(config,/request.mode === "candidate-ci"/);assert.match(config,/timeout:120_000/);
});
test('browser harness reuses established ledger/readiness and leaves real assets and animation native',async()=>{
  const helper=await readFile('e2e/helpers/touch-ui-audit.ts','utf8'),spec=await readFile('e2e/touch-ui-live.spec.ts','utf8');
  for(const required of ['createTouchRuntimeEvidence','cabin-preparation-readiness.generated.mjs','budgets.initial','remainingBudget(initial)','Input.dispatchTouchEvent','event.isTrusted','animations:"allow"','scale:"css"']) assert.ok(helper.includes(required));
  for(const forbidden of ['page.route(','route.fulfill(','force:true','animations:"disabled"','createAppServer(','createServer(','__r35PreparationDecode']) assert.ok(!helper.includes(forbidden));
  assert.ok(spec.includes('continueHomeWithout3D(page)'));assert.ok(spec.includes('width:720'));assert.ok(spec.includes('home-footer'));assert.ok(spec.includes('Physical') === false);
});

test('reference navigation label matches the exact catalog model name',async()=>{
  const facts=JSON.parse(await readFile('src/data/specifications.json','utf8'));
  const model=facts.variants.find(value=>value.id==='nismo');
  const spec=await readFile('e2e/touch-ui-live.spec.ts','utf8');
  assert.ok(spec.includes(`name:'Explore ${model.name}'`));
});

test('actual reused UI ledger handles catalog HTML with fixed allowed 15s windows',async()=>{
  const page=new EventEmitter(),body=Buffer.from('accepted fixture'),origin=TOUCH_UI_BASELINE.origin;
  const pin={bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
  const pins=new Map(['/index.html','/assets/app.js','/assets/app.css'].map(path=>[path,pin]));
  page.goto=async url=>{
    for(const path of [new URL(url).pathname,'/assets/app.js','/assets/app.css']) {
      const request={url:()=>origin+path};page.emit('request',request);
      page.emit('response',{request:()=>request,url:request.url,status:()=>200,body:async()=>body});
    }
  };
  const receipts=[],evidence=createTouchRuntimeEvidence({page,origin,pins,receipts});
  await evidence.navigate(origin+'/models');await evidence.drain();await evidence.finish();
  const snapshot=evidence.snapshot();
  assertTouchRuntimeComplete(snapshot);assert.equal(snapshot.state,'finished');assert.equal(receipts.length,3);
  assert.ok(snapshot.drains.every(drain=>drain.readinessWindow.budget===15000));
  assert.ok(snapshot.requests.every(request=>request.state==='body-completed'));
  evidence.stop();assert.equal(page.listenerCount('request'),0);
});
test('front-end runtime cannot escape pins while unrelated provider frames remain separate',()=>{
  const origin=TOUCH_UI_BASELINE.origin,pins=new Map([['/assets/app.js',{}]]);
  const request={url:origin+'/assets/app.js',resourceType:'script',mainFrame:true,redirected:false};
  assert.equal(assertTouchRuntimeRequest(request,origin,pins),'application');
  for(const changed of [{url:origin+'/assets/unknown.js'},{url:origin+'/assets/app.js?x=1'},{url:'https://example.com/app.js'},{redirected:true}]) assert.throws(()=>assertTouchRuntimeRequest({...request,...changed},origin,pins));
  assert.equal(assertTouchRuntimeRequest({...request,mainFrame:false,url:'https://media.flixel.com/player.js'},origin,pins),'provider-frame-outside-app-identity');
});

test('finished runtime receipts still require every frontend body kind',()=>{
  const snapshot={state:'finished',eventErrors:[],requests:['/models','/assets/app.js','/assets/app.css'].map(path=>({path,state:'body-completed'}))};
  assertTouchRuntimeComplete(snapshot);
  for(let index=0;index<3;index++) assert.throws(()=>assertTouchRuntimeComplete({...snapshot,requests:snapshot.requests.filter((_,i)=>i!==index)}));
  assert.throws(()=>assertTouchRuntimeComplete({...snapshot,eventErrors:['original failure']}));
  assert.throws(()=>assertTouchRuntimeComplete({...snapshot,state:'receiving'}));
});
