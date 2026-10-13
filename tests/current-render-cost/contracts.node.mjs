import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as p from '../../scripts/current-render-cost-policy.mjs';
const app = resolve(process.env.R35_TEST_APP_ROOT ?? '.');
const request = () => ({version:1,allow:false,contract:'current-render-cost-four-cell-v1',sourceCommit:'28f586ce35b4441254c10583fc7bc1da3265a106',sourceTree:'7632e86545bdd559e38cac1133245b5b284b5bbb1b97d2fc6100ad66d021011b',cells:['studio-standard','studio-reduced','night-standard','night-reduced'],viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce',budgets:{availabilityMs:90000,functionalMs:15000,captureMs:45000},retries:0});
// Mutation: loosen any exact field or admit an enabled request in the private freeze.
test('private request is exact, closed, disabled and immutable across all four cells',()=>{
 assert.deepEqual(p.validateRequest(request()),request());
 for(const field of ['sourceCommit','sourceTree','contract']){const r=request();r[field]='wrong';assert.throws(()=>p.validateRequest(r));}
 for(const mutate of [r=>r.allow=true,r=>r.budgets.functionalMs++,r=>r.budgets.captureMs++,r=>r.budgets.availabilityMs++,r=>r.deviceScaleFactor=2,r=>r.retries=1,r=>r.cells.pop(),r=>r.viewport.width=1440,r=>r.extra=true]){const r=request();mutate(r);assert.throws(()=>p.validateRequest(r));}
});
test('CI launch is denied while frozen before any filesystem or runtime dependency',()=>{
 assert.throws(()=>p.authorizeRun(request(),{}),/disabled/);
 assert.throws(()=>p.authorizeRun({...request(),allow:true},{}),/CI/);
});
// Mutation: omit one original input batch or screenshot, use an isolated key, or alter counts.
test('prefix retains every camera/reset/orbit/zoom action through zoom-reset identically',()=>{
 const plans=request().cells.map(cell=>p.actionPrefix(cell)); assert.deepEqual(plans[0],plans[1]);assert.deepEqual(plans[0],plans[2]);assert.deepEqual(plans[2],plans[3]);
 const plan=plans[0];assert.ok(Array.isArray(plan),'Missing exact action prefix');assert.equal(plan[0].id,'select-environment');
 assert.deepEqual(plan.filter(x=>x.type==='camera').map(x=>x.label),['Front ¾','Front','Rear','Side','Top detail','Front ¾']);
 assert.deepEqual(plan.filter(x=>x.type==='key').map(x=>[x.key,x.count]),[['Shift+ArrowDown',12],['Home',1],...Array.from({length:8},()=>['Shift+ArrowRight',5]),['Home',1],['+',40],['+',2],['-',50],['-',2],['Home',1]]);
 assert.deepEqual(plan.filter(x=>x.type==='capture').map(x=>x.id),['hero','front','rear','side','top','low','home-reset',...Array.from({length:8},(_,i)=>`orbit-${i+1}`),'zoom-min','zoom-min-clamped','zoom-max','zoom-max-clamped','zoom-reset']);
 assert.equal(plan.at(-1).id,'zoom-reset'); assert.throws(()=>p.actionPrefix('gallery-standard'));
});
test('quality dimensional contract gives a genuine pixel contrast without changing MSAA',()=>{
 assert.deepEqual(p.expectedDimensions({renderWidth:1920,renderHeight:924,nativeDpr:1},'standard'),{pixelRatio:1,width:1920,height:924});
 const d=p.expectedDimensions({renderWidth:1920,renderHeight:924,nativeDpr:1},'reduced');assert.ok(d,'Missing dimensional contract');assert.equal(d.width,1441);assert.equal(d.height,693);assert.ok(d.width*d.height<=1000000);assert.throws(()=>p.expectedDimensions({renderWidth:1920,renderHeight:924,nativeDpr:1},'auto'));
});
test('source verification binds exact checkout, runtime and historical helpers',async()=>{
 const r=await p.verifySources(app);assert.ok(r,'Missing source verification');assert.equal(r.source.sha256,request().sourceTree);assert.equal(r.sourceCommit,request().sourceCommit);assert.equal(Object.keys(r.helpers).length,11);
});
test('readiness derivation is exactly existing reviewed quality-budget derivation',async()=>{
 const bytes=await readFile(resolve(app,'scripts/functional-capture-readiness.mjs'));
 const old=await import(pathToFileURL(resolve(app,'scripts/build-selectable-quality-drivers.mjs')));
 assert.equal(p.deriveReadiness(bytes),old.deriveQualityReadiness(bytes));assert.throws(()=>p.deriveReadiness(Buffer.concat([bytes,Buffer.from('\n')])));
});
test('a gate miss preserves its raw fence and every later prefix as blocked, never filtered',()=>{
 const plan=p.actionPrefix('studio-standard');assert.ok(Array.isArray(plan),'Missing exact action prefix');const rows=plan.map(s=>({...s,status:'planned'})); const i=plan.findIndex(x=>x.id==='zoom-min');const raw={latestFence:{id:7,previous:null,status:0x911b}};
 const result=p.censor(rows,i,{error:'15s expired',raw});assert.equal(result[i].status,'failed');assert.deepEqual(result[i].failure.raw,raw);assert.ok(result.slice(i+1).every(x=>x.status==='blocked'));assert.equal(result.length,plan.length);assert.equal(result[i+1].blockedBy,'zoom-min');
});
test('pair comparison rejects workload changes and keeps censored results visible',()=>{
 const base={cell:'studio-standard',sourceTree:request().sourceTree,models:[{path:'/car',sha256:'a',bytes:1}],backend:'SwiftShader',steps:[{id:'hero',status:'passed',state:{pose:[1],vehicle:{environment:'studio'}},dimensions:{width:1920,height:924},workload:{passes:2,draws:20,triangles:30}}]};
 const reduced=structuredClone(base);reduced.cell='studio-reduced';reduced.steps[0].dimensions={width:1441,height:693};
 assert.ok(p.comparePair(base,reduced),'Missing pair comparison');assert.equal(p.comparePair(base,reduced).comparable,false);reduced.steps[0].workload.draws++;assert.equal(p.comparePair(base,reduced).comparable,false);
 reduced.steps[0].status='failed';reduced.steps[0].failure={raw:{pending:true}};const result=p.comparePair(base,reduced);assert.equal(result.comparable,false);assert.deepEqual(result.cells[1].steps[0].failure.raw,{pending:true});
});
test('activation admits only exact main dispatch or bounded stage-marker main push',()=>{
 const enabled={...request(),allow:true},env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:'a'.repeat(40),R35_ALLOW_CURRENT_RENDER_COST:'1',R35_RENDER_COST_CELL:'studio-standard',R35_RENDER_COST_COMMIT_MESSAGE:'[stage-current-render-cost] Enable approved four cells'};
 assert.deepEqual(p.authorizeRun(enabled,env),{cell:'studio-standard',environment:'studio',quality:'standard'});
 for(const patch of [{GITHUB_REF:'refs/heads/test'},{R35_RENDER_COST_COMMIT_MESSAGE:'unrelated'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REPOSITORY:'unknown/repo'},{R35_ALLOW_CURRENT_RENDER_COST:'0'}])assert.throws(()=>p.authorizeRun(enabled,{...env,...patch}));
 assert.ok(p.authorizeRun(enabled,{...env,GITHUB_EVENT_NAME:'workflow_dispatch',R35_RENDER_COST_COMMIT_MESSAGE:''}));
});
