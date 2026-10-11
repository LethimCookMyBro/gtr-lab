/** Read-only, live-only candidate acceptance. No baseline verdict or deployment action. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sourceIdentity, sha256 } from './ui-optimization-policy.mjs';
import { exerciseDrawer } from './ui-optimization-browser.mjs';
import { observeOpeningClicks, recordDrawerCapture } from './drawer-compositing-browser.mjs';
import { createUiReceipts } from './ui-optimization-receipts.mjs';
import { models, cabinWire } from './cabin-preparation-policy.mjs';
import { verifyPublicPreparationModels, readModelRepresentation, assertModelRepresentation } from './diagnose-cabin-preparation.mjs';
import { liveOrigin, liveContract, liveReleaseMarker, liveStagedSource, liveSourceTree, validateLiveRequest, validateLiveMarker, assertLiveRevision, assertLiveDrawerStyles, assertLiveCandidate } from './ui-optimization-live-policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const expectedRequest={version:1,allow:true,contract:liveContract,stagedSource:liveStagedSource,sourceTree:liveSourceTree,modelSha256:models[0].sha256};
const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
async function bounded(work,ms,label){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}: original ${ms}ms deadline exceeded`)),ms);})]);}finally{clearTimeout(timer);}}
export async function verifyLiveCheckout(env=process.env) {
  const target=validateLiveRequest(expectedRequest,env); // Reject before file traversal or sockets.
  assert.equal(resolve('.'),root,'Live proof uses its own exact checked-out release');
  const request=JSON.parse(await readFile(resolve(root,'qa/ui-optimization-live-request.json'),'utf8'));
  validateLiveRequest(request,env);
  const release=validateLiveMarker(JSON.parse(await readFile(resolve(root,liveReleaseMarker),'utf8')),request,env);
  const frozen=JSON.parse(await readFile(resolve(root,'qa/fixtures/ui-optimization-live-identity.json'),'utf8'));
  const source=await sourceIdentity(root); assert.deepEqual(source,frozen); assert.equal(source.sha256,liveSourceTree); assert.equal(source.files.length,101);
  const revision={commit:git(['rev-parse','HEAD']),message:git(['log','-1','--format=%B']),trackedStatus:git(['status','--porcelain','--untracked-files=no']),changedFiles:git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n')};
  // Exits nonzero if the reviewed staged commit is not an ancestor. Full history is fetched in CI.
  git(['merge-base','--is-ancestor',liveStagedSource,'HEAD']); revision.stagedIsAncestor=true;
  assertLiveRevision(revision,env);
  return {target,request,release,source,commit:revision.commit,gitTree:git(['rev-parse','HEAD^{tree}']),fullTrackedCheckoutClean:true};
}
export async function verifyLivePreflight({directory,commit,fetchImpl=fetch,representationReader=readModelRepresentation}) {
  assert.match(commit??'',/^[a-f0-9]{40}$/);
  // Compare every declared model in the exact release build before contacting production.
  const localModels=[];
  for(const model of models) {
    const file=resolve(directory,'.'+model.path),info=await lstat(file);
    assert.ok(info.isFile()&&!info.isSymbolicLink()); assert.equal(info.size,model.bytes);
    const bytes=await readFile(file); assert.equal(sha256(bytes),model.sha256); localModels.push({...model});
  }
  const compressedPath=resolve(directory,'.'+models[0].path+'.gz'),compressedInfo=await lstat(compressedPath);
  assert.ok(compressedInfo.isFile()&&!compressedInfo.isSymbolicLink()); assert.equal(compressedInfo.size,cabinWire.bytes);
  const compressed=await readFile(compressedPath);
  assert.equal(compressed.length,cabinWire.bytes); assert.equal(sha256(compressed),cabinWire.sha256);
  const {verifyReleaseAssets}=await import('./verify-release-assets.mjs');
  const assets=await verifyReleaseAssets({directory,commit,fetchImpl});
  const publicModels=await verifyPublicPreparationModels({fetchImpl});
  const transport=[];
  for(const encoding of ['identity','gzip','gzip;q=0'])transport.push(assertModelRepresentation(await representationReader(liveOrigin,encoding,'live'),encoding));
  return {assets,models:publicModels,localModels,transport};
}
export function assertLiveRequest(value,pins) {
  const url=new URL(value);
  if(url.protocol==='blob:'&&url.origin===liveOrigin)return;
  assert.equal(url.origin,liveOrigin,'Unpinned browser request origin');
  if(url.pathname.startsWith('/configurator/'))assert.ok(['/configurator/nismo','/configurator/premium'].includes(url.pathname)&&!url.search&&!url.hash);
  if(/\.(?:js|css)$/.test(url.pathname))assert.ok(pins.has(url.pathname)&&!url.search&&!url.hash,'Unknown runtime bundle');
  if(url.pathname.startsWith('/models/')&&url.pathname.endsWith('.glb'))assert.ok(models.some(model=>model.path===url.pathname)&&!url.search&&!url.hash,'Unknown runtime model');
}
export async function main(env=process.env) {
  validateLiveRequest(expectedRequest,env);
  const identity=await verifyLiveCheckout(env),{target}=identity;
  const output=resolve(root,'ui-optimization-live-results',target.name); await mkdir(output,{recursive:true});
  const row={contract:liveContract,mode:'live',lane:'candidate',...identity,status:'running',startedAt:new Date().toISOString(),openingActions:[],captures:[],runtimeBodies:[],pageErrors:[],requestErrors:[],errors:[],console:[],cleanup:{context:'not-started',browser:'not-started'},
    scope:'Exact released UI candidate only. Unchanged native Drawer buttons, keyboard radios, focus/inert ownership, internal scroll, closing and SPA route cleanup. Homepage choreography is prior staging evidence plus the separate generic live smoke; this run does not re-score it.',
    limitations:['No baseline or comparative speedup verdict is produced.','CSS viewport coverage and SwiftShader are not physical-device performance or touch-device acceptance.','All built HTML/JS/CSS and declared model bodies plus cabin raw/gzip transport are checked before Chromium. Browser-issued HTML/JS/CSS bodies are checked against those exact pins. Model lifecycle and GPU/cabin visual quality are outside this UI-only run.','Inherited action, animation and screenshot deadlines are unchanged. No retry, animation cancellation, forced click, fixture substitution or application state write is introduced.']};
  let saveQueue=Promise.resolve();
  const save=()=>{const text=JSON.stringify(row,null,2);saveQueue=saveQueue.then(()=>writeFile(resolve(output,'report.json'),text));return saveQueue;};
  await save();
  let browser,context,page,receipts;
  try {
    row.publicPreflight=await verifyLivePreflight({directory:resolve(root,'dist'),commit:identity.commit}); await save();
    // Public identity preflight must finish before the browser package is even loaded.
    const {chromium,expect}=await import('@playwright/test');
    const {assets}=row.publicPreflight;
    const pins=new Map([['/index.html',{bytes:assets.html.bytes,sha256:assets.html.sha256}],...assets.assets.map(asset=>[asset.path,{bytes:asset.bytes,sha256:asset.sha256}])]);
    browser=await chromium.launch({timeout:30000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
    context=await browser.newContext({viewport:target.viewport,deviceScaleFactor:target.deviceScaleFactor,reducedMotion:target.reducedMotion,serviceWorkers:'block'});
    page=await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(45000);
    page.on('request',request=>{try{assertLiveRequest(request.url(),pins);assert.equal(request.redirectedFrom(),null,'Public request must not redirect');}catch(error){row.requestErrors.push(String(error));}});
    page.on('pageerror',error=>row.pageErrors.push(String(error)));
    page.on('console',message=>{if(['warning','error'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
    receipts=createUiReceipts({page,origin:liveOrigin,pins,receipts:row.runtimeBodies});
    const drain=async()=>{try{return await receipts.drain();}finally{row.runtimeLedger=receipts.snapshot();await save();}};
    const navigate=async url=>{assertLiveRequest(url,pins);try{return await receipts.navigate(url);}finally{row.runtimeLedger=receipts.snapshot();await save();}};
    const shot=async label=>{
      assert.ok(/^[a-z0-9-]+$/.test(label)); assert.ok(row.captures.length<24);
      const file=label+'.png',capture={label,file}; row.captures.push(capture);
      try {
        await recordDrawerCapture({capture,
          readStyles:()=>page.evaluate(()=>{const read=selector=>{const element=document.querySelector(selector);if(!element)return null;const style=getComputedStyle(element);return {background:style.backgroundColor,backdropFilter:style.backdropFilter,opacity:style.opacity,transform:style.transform};};return {sheet:read('.drawer'),backdrop:read('.drawer-backdrop')};}),
          screenshot:()=>page.screenshot({path:resolve(output,file),timeout:45000,animations:'allow',scale:'css'})});
        assertLiveDrawerStyles(capture.styles);
      } finally {await save();}
    };
    const observedPage=observeOpeningClicks(page,row.openingActions);
    await exerciseDrawer({page:observedPage,target,lane:'candidate',row,shot,expect,drain,save,navigate});
    await receipts.finish(); row.runtimeLedger=receipts.snapshot();
  } catch(error) {row.errors.push({message:String(error),stack:error.stack});}
  finally {
    if(receipts){row.runtimeLedger=receipts.snapshot();receipts.stop();} await save();
    for(const [name,resource] of [['context',context],['browser',browser]]) {
      if(!resource)continue;
      try{await bounded(resource.close(),15000,`${name} cleanup`);row.cleanup[name]='passed';}
      catch(error){row.cleanup[name]='failed';row.errors.push({message:String(error)});} await save();
    }
  }
  try{assertLiveCandidate(row,env);row.status='passed';}
  catch(error){row.status='failed';row.errors.push({message:String(error)});}
  row.finishedAt=new Date().toISOString(); await save(); assert.equal(row.status,'passed','Exact public candidate UI verification');
  return row;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if(process.argv.includes('--check-release'))await verifyLiveCheckout();
  else await main();
}
