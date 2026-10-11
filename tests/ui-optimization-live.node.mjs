/** Socket-free contract tests. This file never starts a server or browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const policy = await import('../scripts/ui-optimization-live-policy.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const origin = 'https://gtr-lab-production.up.railway.app';
const token = '[release-ui-optimization]';
const runtime = 'f530e2009115310a5c229d7024d3dc99dcb0d5ff0939d76cba4f9aeb947942c0';
const stagedSource = 'f975d55468504b8c52151f9d89cf37cf2f988957';
const env = { GITHUB_ACTIONS:'true', GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab', GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'push', GITHUB_SHA:'a'.repeat(40), R35_ALLOW_UI_LIVE:'1', R35_UI_LIVE_VIEWPORT:'desktop', R35_UI_LIVE_COMMIT_MESSAGE:token };
const request = {version:1, allow:true, contract:'ui-optimization-public-candidate-v1', stagedSource, sourceTree:runtime, modelSha256:'8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452'};
const marker = () => ({...request, release:token, modelBytes:20195752, modelGzipSha256:'efe0ace781740e4b1cec685f02bf6b94eb6654447cccb96cc79769bfd01eee16', modelGzipBytes:10194084});
const styles = () => ({sheet:{background:'rgb(23, 27, 30)',backdropFilter:'none',opacity:'1'},backdrop:{background:'rgba(5, 8, 9, 0.4)',backdropFilter:'none'}});

test('dedicated live request admits only the fixed public origin on a release main push', () => {
  assert.equal(typeof policy.validateLiveRequest, 'function', 'New separate live policy must exist');
  const target = policy.validateLiveRequest(request, env);
  assert.equal(target.origin, origin); assert.equal(target.mode, 'live');
  assert.deepEqual(target.viewport, {width:1440,height:900});
  for (const [name,width] of [['narrow',320],['mobile',390]]) assert.equal(policy.validateLiveRequest(request,{...env,R35_UI_LIVE_VIEWPORT:name}).viewport.width,width);
  for (const change of [{GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REPOSITORY:'fork/repo'},{GITHUB_REF:'refs/heads/other'},{GITHUB_SHA:'main'},{GITHUB_SHA:stagedSource},{R35_ALLOW_UI_LIVE:undefined},{R35_UI_LIVE_VIEWPORT:'reduced'},{R35_UI_LIVE_COMMIT_MESSAGE:'[stage-drawer-compositing]'},{R35_UI_LIVE_COMMIT_MESSAGE:token+' [stage-anything]'},{R35_UI_LIVE_COMMIT_MESSAGE:'[release-cabin-preparation-ao-static-faces]'}]) assert.throws(()=>policy.validateLiveRequest(request,{...env,...change}));
  for (const key of ['R35_UI_URL','R35_UI_ROOT','HOME_QA_URL','R35_DRAWER_URL','R35_DRAWER_ROOT','R35_UI_LIVE_URL','R35_UI_LIVE_ROOT','R35_SOURCE_SHA','R35_EXPECTED_APP_TREE','R35_CAPTURE_TIMEOUT','R35_MAX_BUFFER_PIXELS','R35_PREPARATION_MODE','R35_ALLOW_LIVE_PREPARATION']) assert.throws(()=>policy.validateLiveRequest(request,{...env,[key]:origin}));
  for(const key of Object.keys(request)){const copy={...request};delete copy[key];assert.throws(()=>policy.validateLiveRequest(copy,env));}
  for(const change of [{allow:false},{version:2},{contract:'drawer-opaque-compositing-v2'},{stagedSource:'b'.repeat(40)},{sourceTree:'f'.repeat(64)},{modelSha256:'f'.repeat(64)},{baseUrl:origin},{baselineCommit:stagedSource}]) assert.throws(()=>policy.validateLiveRequest({...request,...change},env));
});
test('new release marker binds exact staged runtime and unchanged raw/gzip model identities', () => {
  assert.equal(typeof policy.validateLiveMarker, 'function');
  assert.deepEqual(policy.validateLiveMarker(marker(),request,env),marker());
  for(const key of Object.keys(marker())){const copy=marker();delete copy[key];assert.throws(()=>policy.validateLiveMarker(copy,request,env));}
  for(const change of [{release:'[release-cabin-preparation-ao-static-faces]'},{allow:false},{sourceTree:'f'.repeat(64)},{stagedSource:'a'.repeat(40)},{modelBytes:19170816},{modelGzipBytes:1},{modelGzipSha256:'f'.repeat(64)},{sourceSha:'current'}]) assert.throws(()=>policy.validateLiveMarker({...marker(),...change},request,env));
  assert.throws(()=>policy.validateLiveMarker(request,request,env));
});
test('candidate style gate rejects old blurred sheet, alpha or backdrop treatment drift', () => {
  assert.equal(typeof policy.assertLiveDrawerStyles, 'function');
  policy.assertLiveDrawerStyles(styles());
  for(const mutate of [s=>s.sheet.background='rgba(23, 27, 30, 0.922)',s=>s.sheet.backdropFilter='blur(30px)',s=>s.sheet.opacity='0.99',s=>s.backdrop.backdropFilter='blur(4px)',s=>s.backdrop.background='rgba(5, 8, 9, 0.5)',s=>delete s.sheet]){const copy=styles();mutate(copy);assert.throws(()=>policy.assertLiveDrawerStyles(copy));}
});

test('actual release revision cannot borrow a marker from another commit or a dirty checkout',()=>{
  assert.equal(typeof policy.assertLiveRevision,'function');
  const evidence={commit:env.GITHUB_SHA,message:token,changedFiles:[policy.liveReleaseMarker],trackedStatus:'',stagedIsAncestor:true};
  policy.assertLiveRevision(evidence,env);
  for(const change of [{commit:'b'.repeat(40)},{message:token+' changed'},{changedFiles:[]},{trackedStatus:' M src/styles.css'},{stagedIsAncestor:false}]) assert.throws(()=>policy.assertLiveRevision({...evidence,...change},env));
});

const sequence=['nismo:Environment','nismo:Camera','nismo:route-unmount','premium:Environment','premium:Camera','premium:route-unmount'];
const openings=['Environment','Environment','Camera','Camera','Switch model','Environment','Environment','Camera','Camera','Switch model'];
const captures=['nismo-environment-settled','nismo-environment-bottom','nismo-camera-settled','premium-environment-focus-settled','premium-environment-bottom','premium-camera-settled'];
function healthyCandidate() {
  const pin={bytes:4,sha256:'b'.repeat(64)};
  const assets={status:'passed',commit:env.GITHUB_SHA,origin,html:{...pin,path:'/'},assets:[{...pin,path:'/assets/a.js',url:origin+'/assets/a.js'},{...pin,path:'/assets/a.css',url:origin+'/assets/a.css'}]};
  const requests=[1,2].flatMap(generation=>['/index.html','/assets/a.js','/assets/a.css'].map(path=>({generation,path,state:'body-completed',...pin})));
  return {mode:'live',lane:'candidate',commit:env.GITHUB_SHA,source:{sha256:runtime,files:Array.from({length:101},()=>({}))},fullTrackedCheckoutClean:true,publicPreflight:{assets,models:[{path:'/models/r35-cabin-contact-ao-static-faces-8645956f.glb',bytes:20195752,sha256:request.modelSha256,url:origin+'/models/r35-cabin-contact-ao-static-faces-8645956f.glb'},{path:'/models/ciasny-r35.glb',bytes:8296356,sha256:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d',url:origin+'/models/ciasny-r35.glb'},{path:'/models/r35-exterior-cabin-proxy-49d7c2ab.glb',bytes:956368,sha256:'49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347',url:origin+'/models/r35-exterior-cabin-proxy-49d7c2ab.glb'}],transport:['identity','gzip','gzip;q=0'].map(acceptEncoding=>({acceptEncoding,status:200,contentEncoding:acceptEncoding==='gzip'?'gzip':'identity',wireEntityBytes:acceptEncoding==='gzip'?10194084:20195752,wireEntitySha256:acceptEncoding==='gzip'?marker().modelGzipSha256:request.modelSha256,decodedBytes:20195752,decodedSha256:request.modelSha256}))},
    errors:[],pageErrors:[],requestErrors:[],cleanup:{context:'passed',browser:'passed'},runtimeLedger:{state:'finished',errors:[],eventErrors:[],lateEvents:[],requests,generations:[1,2].map(generation=>({generation,state:'sealed'}))},
    drawer:sequence.map(value=>{const [model,panel]=value.split(':');return {model,panel,checks:[{label:'native check',passed:true}]};}),drawerFailures:[],
    animationDiagnostics:openings.map((panel,i)=>({panel,status:'settled',originalDeadlineMs:5000,startedAt:i*1000+1,elapsedMs:100})),
    openingActions:openings.map((panel,i)=>({panel,status:'returned',actionStartMs:i*1000,clickReturnMs:i*1000+1,clickDurationMs:1})),
    captures:captures.map((label,i)=>({label,status:'captured',styles:styles(),sha256:'c'.repeat(64),actionStartMs:i*1000,captureStartMs:i*1000+1,captureReturnMs:i*1000+2,observationEndMs:i*1000+3,captureDurationMs:1,observationDurationMs:3,originalDeadlineMs:45000}))};
}
test('candidate-only verdict requires full native sequence, exact identities, styles, original deadlines and cleanup',()=>{
  assert.equal(typeof policy.assertLiveCandidate,'function');
  policy.assertLiveCandidate(healthyCandidate(),env);
  for(const mutate of [r=>r.lane='baseline',r=>r.source.sha256='f'.repeat(64),r=>r.source.files.pop(),r=>r.fullTrackedCheckoutClean=false,r=>r.publicPreflight.assets.commit='d'.repeat(40),r=>r.publicPreflight.assets.origin='http://127.0.0.1:4189',r=>r.publicPreflight.models[0].sha256='f'.repeat(64),r=>r.publicPreflight.transport[1].wireEntityBytes=1,r=>r.errors.push('failed'),r=>r.pageErrors.push('exception'),r=>r.requestErrors.push('unknown script'),r=>r.cleanup.browser='failed',r=>r.runtimeLedger.state='open',r=>r.runtimeLedger.requests[0].state='issued',r=>r.runtimeLedger.requests[0].sha256='e'.repeat(64),r=>r.runtimeLedger.generations.pop(),r=>r.runtimeLedger.lateEvents.push({}),r=>r.drawer.pop(),r=>r.drawer[0].checks[0].passed=false,r=>r.drawerFailures.push('failed'),r=>r.animationDiagnostics[0].elapsedMs=5001,r=>r.openingActions.pop(),r=>r.captures.pop(),r=>r.captures[0].styles.sheet.backdropFilter='blur(30px)',r=>r.captures[0].observationDurationMs=45001,r=>r.captures[0].sha256='']){const row=healthyCandidate();mutate(row);assert.throws(()=>policy.assertLiveCandidate(row,env));}
});

const driver = await import('../scripts/ui-optimization-live.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
test('live entry rejects invalid authorization before filesystem/browser/network work',async()=>{
  assert.equal(typeof driver.main,'function','New live-only driver must exist');
  await assert.rejects(driver.main({...env,R35_ALLOW_UI_LIVE:undefined}));
});
test('live runtime rejects unpinned code, redirects and external request origins',()=>{
  assert.equal(typeof driver.assertLiveRequest,'function');
  const pins=new Map([['/index.html',{}],['/assets/a.js',{}],['/assets/a.css',{}]]);
  for(const path of ['/configurator/nismo','/configurator/premium','/assets/a.js','/assets/a.css','/images/example.jpg','/models/ciasny-r35.glb'])driver.assertLiveRequest(origin+path,pins);
  for(const url of ['http://127.0.0.1:4189/configurator/nismo','https://other.test/assets/a.js',origin+'/assets/unknown.js',origin+'/assets/unknown.css',origin+'/assets/a.js?x',origin+'/configurator/other',origin+'/models/unknown.glb',origin+'/models/ciasny-r35.glb?x'])assert.throws(()=>driver.assertLiveRequest(url,pins));
});
test('live workflow requires exact new release marker and makes no deployment or local server',async()=>{
  const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
  const source=await read('scripts/ui-optimization-live.mjs'),workflow=await read('.github/workflows/ui-optimization-live.yml');
  assert.ok(source.length>0&&workflow.length>0,'Separate live source/workflow must exist');
  assert.ok(source.indexOf('await verifyLiveCheckout(')<source.indexOf('await verifyLivePreflight('));
  assert.ok(source.indexOf('await verifyLivePreflight(')<source.indexOf("await import('@playwright/test')"));
  assert.ok(source.includes("exerciseDrawer({page:observedPage,target,lane:'candidate'"));
  assert.doesNotMatch(source,/createAppServer|\.listen\(|server\.mjs|compareSnapshots|assessDrawerLanes|baseline-app|traceWindow/);
  for(const text of [policy.liveReleaseMarker,token,'contents: read','persist-credentials: false','ref: ${{ github.sha }}','fetch-depth: 0','viewport: [desktop, narrow, mobile]','node scripts/wait-railway.mjs','node scripts/ui-optimization-live.mjs'])assert.ok(workflow.includes(text),text);
  assert.doesNotMatch(workflow,/workflow_dispatch|continue-on-error|npm test|tests\/server|git push|railway up|release-cabin-preparation-ao-static-faces/);
});

test('preflight hashes exact local build/public bodies and raw/gzip before any browser is loaded',async()=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os'),{gunzipSync}=await import('node:zlib');
  const read=path=>readFile(new URL('../'+path,import.meta.url));
  const gzip=await read('qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz');
  const manifest=JSON.parse(await read('modeldata/manifest.json'));
  const models=healthyCandidate().publicPreflight.models;
  const modelBodies=[gunzipSync(gzip),Buffer.concat(await Promise.all(manifest[0].chunks.map(chunk=>read('modeldata/'+chunk.path)))),gunzipSync(await read('qa/cabin-preview/r35-exterior-cabin-proxy.glb.gz'))];
  const directory=await mkdtemp(join(tmpdir(),'ui-live-preflight-'));
  const html=Buffer.from('<!doctype html><script type="module" src="/assets/a.js"></script><link rel="stylesheet" href="/assets/a.css">');
  const bodies=new Map([['/',html],['/assets/a.js',Buffer.from('export const release=true;')],['/assets/a.css',Buffer.from('body { color: white; }')],...models.map((model,index)=>[model.path,modelBodies[index]])]);
  try {
    await mkdir(join(directory,'assets'));await mkdir(join(directory,'models'));
    for(const [path,body] of bodies)await writeFile(join(directory,path==='/'?'index.html':path.slice(1)),body);
    await writeFile(join(directory,models[0].path.slice(1)+'.gz'),gzip);
    let calls=[],wire=[];
    const fetchImpl=async(url,options)=>{
      assert.ok(url.startsWith(origin+'/'));const path=url.slice(origin.length),body=bodies.get(path);assert.ok(body,'Only locally declared exact URLs may be read');calls.push({url,options});
      return new Response(body,{headers:{'content-type':path==='/'?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'model/gltf-binary','content-length':String(body.length)}});
    };
    const representationReader=async(base,encoding,mode)=>{assert.equal(base,origin);assert.equal(mode,'live');wire.push(encoding);const compressed=encoding==='gzip',body=compressed?gzip:modelBodies[0];return {status:200,headers:{'content-length':String(body.length),vary:'Accept-Encoding',...(compressed?{'content-encoding':'gzip'}:{})},body};};
    const result=await driver.verifyLivePreflight({directory,commit:env.GITHUB_SHA,fetchImpl,representationReader});
    assert.equal(result.assets.commit,env.GITHUB_SHA);assert.equal(result.assets.assets.length,2);assert.deepEqual(result.models,models);
    assert.deepEqual(wire,['identity','gzip','gzip;q=0']);assert.equal(calls.length,6);
    for(const call of calls){assert.equal(call.options.redirect,'error');assert.ok(call.options.signal instanceof AbortSignal);}
    const changed=Buffer.from(modelBodies[0]);changed[changed.length-1]^=1;
    await writeFile(join(directory,models[0].path.slice(1)),changed);calls=[];wire=[];
    await assert.rejects(driver.verifyLivePreflight({directory,commit:env.GITHUB_SHA,fetchImpl,representationReader}));
    assert.deepEqual(calls,[],'Changed local model must fail before contacting production');assert.deepEqual(wire,[]);
    await writeFile(join(directory,models[0].path.slice(1)),modelBodies[0]);
    await assert.rejects(driver.verifyLivePreflight({directory,commit:env.GITHUB_SHA,fetchImpl:async(url,options)=>url.endsWith('/assets/a.js')?new Response('different-release',{headers:{'content-type':'text/javascript'}}):fetchImpl(url,options),representationReader}));
    assert.deepEqual(wire,[],'Changed public JS must fail before raw model requests');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('frozen fixture is exactly the current runtime while historical contracts stay untouched',async()=>{
  const {sourceIdentity}=await import('../scripts/ui-optimization-policy.mjs');
  const fixture=JSON.parse(await readFile(new URL('../qa/fixtures/ui-optimization-live-identity.json',import.meta.url),'utf8'));
  assert.deepEqual(await sourceIdentity(new URL('../',import.meta.url).pathname),fixture);assert.equal(fixture.sha256,runtime);assert.equal(fixture.files.length,101);
  const original=await import('../scripts/cabin-preparation-policy.mjs');assert.equal(original.preparationTree,'bc1ac6ce3c3a97bf683a6b0bdc057e73f47800544e913b675db583b65f1605b5');
  assert.equal(JSON.parse(await readFile(new URL('../qa/ui-optimization-request.json',import.meta.url),'utf8')).candidateTree,'3cc14885944d21ec3c934a0c36d468b064225f0c24ade0870f24566dedb0507b');
});
