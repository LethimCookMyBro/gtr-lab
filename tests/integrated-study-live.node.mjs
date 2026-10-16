import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {deriveStudyLiveTest,deriveStudyLiveNetwork,replaceOnce,hash} from '../scripts/integrated-study-live-derive.mjs';
import {ORIGIN,ACCEPTED_BUILD,validateStudyLiveEnvironment,validateStudyLiveRequest,observeStudyLiveAppBodies} from '../scripts/integrated-study-live-contract.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const request={version:1,allow:true,origin:ORIGIN,expectedDeployedCommit:'1'.repeat(40),railwayDeploymentId:'12345678-1234-1234-1234-123456789abc',buildSha256:ACCEPTED_BUILD};
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'1'.repeat(40),R35_STUDY_LIVE:'1',R35_STUDY_LIVE_MESSAGE:'[verify-integrated-r35-study-live]'};
test('exact workload and recorder derivations; historical source remains untouched',()=>{
 assert.equal(deriveStudyLiveTest(read('e2e/integrated-r35-study.spec.ts')),String(read('e2e/integrated-r35-study-live.spec.ts')));
 assert.equal(deriveStudyLiveNetwork(read('scripts/integrated-study-network.mjs')),String(read('scripts/integrated-study-live-network.mjs')));
 for(const [fn,path] of [[deriveStudyLiveTest,'e2e/integrated-r35-study.spec.ts'],[deriveStudyLiveNetwork,'scripts/integrated-study-network.mjs']]) assert.throws(()=>fn(Buffer.concat([read(path),Buffer.from(' ')])));
 assert.throws(()=>replaceOnce('a a','a','b'));assert.throws(()=>replaceOnce('a','b','c'));
});
test('closed request rejects inactive, incomplete, changed origin and injected fields',()=>{
 validateStudyLiveRequest(request);
 for(const patch of [{allow:false},{origin:'http://127.0.0.1:4173'},{expectedDeployedCommit:null},{railwayDeploymentId:null},{buildSha256:'0'.repeat(64)},{timeout:999999}])assert.throws(()=>validateStudyLiveRequest({...request,...patch}));
});
test('CI boundaries reject reruns, release marker, browser and target overrides',()=>{
 validateStudyLiveEnvironment(env);
 for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REF:'refs/heads/other'},{R35_STUDY_LIVE_MESSAGE:'[verify-integrated-r35-study-live] [release-study]'},{R35_BASE_URL:ORIGIN},{PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:'/tmp/chrome'},{R35_CAPTURE_TIMEOUT:'999999'}])assert.throws(()=>validateStudyLiveEnvironment({...env,...patch}));
});
function fixture() {
 const page=new EventEmitter(),frame={};page.mainFrame=()=>frame;
 const paths=['/index.html','/assets/main.js','/assets/main.css'];
 const bodies=new Map(paths.map(path=>[path,Buffer.from(path)]));
 const pins=new Map([...bodies].map(([path,body])=>[path,{bytes:body.length,sha256:hash(body)}]));
 const report={};const observer=observeStudyLiveAppBodies(page,pins,report);
 function issue(path,options={}) {
  const type=path==='/index.html'?'document':path.endsWith('.css')?'stylesheet':'script';
  const url=options.url??ORIGIN+(type==='document'?'/configurator/premium?study=2008':path);
  const req={resourceType:()=>type,url:()=>url,frame:()=>frame,redirectedFrom:()=>options.redirect??null};
  page.emit('request',req);
  page.emit('response',{request:()=>req,url:()=>url,status:()=>options.status??200,body:async()=>options.body??bodies.get(path)});
 }
 return {issue,observer,report};
}
test('actual issued document JS CSS bodies complete and retain exact receipts',async()=>{
 const f=fixture();for(const path of ['/index.html','/assets/main.js','/assets/main.css'])f.issue(path);
 const report=await f.observer.finish();assert.equal(report.requests.length,3);assert.ok(report.requests.every(row=>row.state==='body-completed'));assert.equal(f.report.appBodies.state,'finished');
});
for(const [name,path,options] of [
 ['different origin','/assets/main.js',{url:'https://example.org/assets/main.js'}],
 ['bundle query','/assets/main.js',{url:ORIGIN+'/assets/main.js?cache=1'}],
 ['redirect','/assets/main.js',{redirect:{}}],
 ['unlisted bundle','/assets/other.js',{}],
 ['wrong body','/assets/main.js',{body:Buffer.from('corrupt')}],
 ['HTTP error','/assets/main.js',{status:503}],
 ['wrong study document','/index.html',{url:ORIGIN+'/configurator/premium'}],
])test('fails closed on '+name,async()=>{
 const f=fixture();if(path!='/index.html')f.issue('/index.html');f.issue(path,options);f.issue('/assets/main.css');
 await assert.rejects(f.observer.finish());assert.ok(f.report.appBodies);
});
test('missing JS body cannot count as complete',async()=>{const f=fixture();f.issue('/index.html');f.issue('/assets/main.css');await assert.rejects(f.observer.finish());});
test('unexpected second document rejected',async()=>{const f=fixture();f.issue('/index.html');f.issue('/assets/main.js');f.issue('/assets/main.css');f.issue('/index.html');await assert.rejects(f.observer.finish());});
