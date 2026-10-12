/** Exact-source public adapter; never deploys, reruns, or accepts arbitrary target URLs. */
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {applicationIdentity} from './diagnose-dpr-motion.mjs';
import {sha256,assertSourcePair,verifyFilePins,comparisonProfile,assertPreviewSelection} from './cabin-leather-comparison-policy.mjs';
import {liveOrigin,liveContract,liveModel,liveReleaseMarker,liveStagedSource,comparisonPath,stagedArchivePath,derivationPins,liveHelperPaths,validateLiveInvocation,validateLiveRequest,validateLiveMarker,assertLiveRevision,assertLiveCaptureReport} from './cabin-fine-live-policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
export function deriveFineLiveSources(sources) {
 for(const [path,hash] of Object.entries(derivationPins))assert.equal(sha256(sources[path]??''),hash,`Exact reviewed derivation preimage: ${path}`);
 let collector=String(sources['scripts/collect-cabin-leather-comparison.mjs']);
 const once=(before,after)=>{assert.equal(collector.split(before).length,2,`Exactly one collector preimage: ${before}`);collector=collector.replace(before,after);};
 once("from './cabin-leather-model-body.mjs';","from './cabin-fine-live-model-body.generated.mjs';");
 once('export async function main(env=process.env) {',"import {liveContract,validateLiveTarget} from './cabin-fine-live-policy.mjs';\nexport async function main(env,liveIdentity) {");
 once("comparisonRequestPath(env.R35_LEATHER_COMMIT_MESSAGE??'')","'qa/cabin-fine-roughness-comparison-request.json'");
 once('validateComparisonEnvironment(env,request)','validateLiveTarget(env,request,liveIdentity)');
 once("root=resolve(process.argv[2]??'.')","root=harness");
 once("resolve('cabin-leather-results',", "resolve('cabin-fine-live-results',");
 once("contract:request.contract,requestSha256:","contract:liveContract,materialContract:request.contract,publicRelease:liveIdentity,publicPreflight:liveIdentity.publicPreflight,requestSha256:");
 once('let browser,context,server,page,','let browser,context,page,');
 once("    const {createAppServer}=await import(pathToFileURL(resolve(root,'server.mjs')));\n    server=createAppServer(resolve(root,'dist'));await new Promise((done,reject)=>{server.once('error',reject);server.listen(4178,'127.0.0.1',done);});\n",'');
 once("    if(server)try{await boundedOperation(cleanupWindow,'close production server',()=>new Promise((done,reject)=>server.close(e=>e?reject(e):done())));report.cleanup.server='closed';}catch(e){report.errors.push(String(e));report.result='failed';}\n",'');
 once("if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});\n",'');
 const modelSource=String(sources['scripts/cabin-leather-model-body.mjs']),originPreimage="const baseOrigin='http://127.0.0.1:4178';";
 assert.equal(modelSource.split(originPreimage).length,2);
 const modelBody=modelSource.replace(originPreimage,`const baseOrigin='${liveOrigin}';`);
 const transportSource=String(sources['scripts/diagnose-cabin-preparation.mjs']),start='/** A raw same-origin transport receipt',end='export async function main(env = process.env)';
 assert.equal(transportSource.split(start).length,2);assert.equal(transportSource.split(end).length,2);
 const {gzipBytes,gzipSha256,...model}=liveModel;
 const transport=`import assert from 'node:assert/strict';\nimport {gunzipSync} from 'node:zlib';\nimport {budgets,sha256,preparationOrigin,models as historicalModels} from './cabin-preparation-policy.mjs';\nconst models=[${JSON.stringify(model)},...historicalModels.slice(1)];\nconst cabinWire=${JSON.stringify({bytes:gzipBytes,sha256:gzipSha256})};\n`+transportSource.slice(transportSource.indexOf(start),transportSource.indexOf(end));
 assert.doesNotMatch(collector,/createAppServer|server\.listen|server\.close|127\.0\.0\.1/);
 return {collector,modelBody,transport};
}
export function assertStagedArchive(stagedBytes,archiveBytes,comparison) {
 assert.equal(Buffer.from(stagedBytes).equals(Buffer.from(archiveBytes)),true,'Archive must preserve exact git-show staged bytes');
 const staged=JSON.parse(stagedBytes);assertSourcePair(staged);assert.equal(staged.allow,true);assert.deepEqual({...staged,allow:false},comparison,'Only the stage-request allow flag may change for release');
}
export async function verifyLiveCheckout(env=process.env) {
 validateLiveInvocation(env);assert.equal(resolve('.'),root,'Public proof requires its exact release checkout');
 const request=JSON.parse(await readFile(resolve(root,'qa/cabin-fine-live-request.json'))),comparison=JSON.parse(await readFile(resolve(root,comparisonPath)));
 validateLiveRequest(request,comparison,env);const release=validateLiveMarker(JSON.parse(await readFile(resolve(root,liveReleaseMarker))),request,comparison,env);
 const profile=comparisonProfile(comparison.contract);await verifyFilePins(root,request.helperPins,liveHelperPaths);await verifyFilePins(root,comparison.helperPins,profile.helperPaths);await verifyFilePins(root,comparison.candidate.buildFiles,profile.buildPaths.candidate);
 const source=await applicationIdentity(root);assert.deepEqual(source,comparison.candidate.source);assertPreviewSelection(await readFile(resolve(root,'src/components/three/cabinPreview.ts'),'utf8'),{expected:comparison.candidate},comparison);
 const revision={commit:git(['rev-parse','HEAD']),message:git(['log','-1','--format=%B']),trackedStatus:git(['status','--porcelain','--untracked-files=no']),changedFiles:git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n'),gitTree:git(['rev-parse','HEAD^{tree}'])};
 git(['merge-base','--is-ancestor',liveStagedSource,'HEAD']);revision.stagedIsAncestor=true;assertLiveRevision(revision,env);
 const stagedBytes=execFileSync('git',['-C',root,'show',liveStagedSource+':'+comparisonPath]);const archive=await readFile(resolve(root,stagedArchivePath));assertStagedArchive(stagedBytes,archive,comparison);
 return {request,comparison,release,source,revision,stagedArchiveSha256:sha256(archive),fullTrackedCheckoutClean:true};
}

export async function verifyFinePublicPreflight({directory,commit,fetchImpl=fetch,transport,representationReader=transport.readModelRepresentation}) {
 assert.match(commit??'',/^[a-f0-9]{40}$/);
 const {models:historicalModels}=await import('./cabin-preparation-policy.mjs');const {gzipBytes,gzipSha256,...fine}=liveModel;
 const models=[fine,...historicalModels.slice(1)],localModels=[];let fineBytes;
 for(const model of models){const path=resolve(directory,'.'+model.path),info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(info.size,model.bytes);const bytes=await readFile(path);assert.equal(sha256(bytes),model.sha256);if(model.path===fine.path)fineBytes=bytes;localModels.push({...model});}
 const compressedPath=resolve(directory,'.'+fine.path+'.gz'),info=await lstat(compressedPath);assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(info.size,gzipBytes);const compressed=await readFile(compressedPath);assert.equal(sha256(compressed),gzipSha256);assert.equal(gunzipSync(compressed,{maxOutputLength:fine.bytes}).equals(fineBytes),true);
 const {verifyReleaseAssets}=await import('./verify-release-assets.mjs');const assets=await verifyReleaseAssets({directory,commit,fetchImpl});
 const publicModels=await transport.verifyPublicPreparationModels({fetchImpl}),representations=[];
 for(const encoding of ['identity','gzip','gzip;q=0'])representations.push(transport.assertModelRepresentation(await representationReader(liveOrigin,encoding,'live'),encoding));
 return {assets,models:publicModels,localModels,transport:representations};
}

export async function verifyCaptureFiles(report,directory) {
 for(const capture of report.captures){assert.match(capture.file,/^(initial|driver|passenger|exterior-restored|driver-repeat)\.png$/);assert.equal(capture.file,capture.label+'.png');const bytes=await readFile(resolve(directory,capture.file));assert.equal(bytes.length,capture.bytes);assert.equal(sha256(bytes),capture.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),report.settings.viewport.width);assert.equal(bytes.readUInt32BE(20),report.settings.viewport.height);}
}
export async function main(env=process.env) {
 validateLiveInvocation(env);assert.equal(resolve('.'),root);
 const output=resolve(root,'cabin-fine-live-results','candidate-'+env.R35_QA_VIEWPORT),reportPath=resolve(output,'report.json');await mkdir(output,{recursive:true});
 const gate={status:'running',contract:liveContract,origin:liveOrigin,releaseCommit:env.GITHUB_SHA,phase:'checkout',errors:[],scope:'Exact deployed fine-cabin bytes and unchanged five-capture native lifecycle. SwiftShader only; no comparative timing, physical-device or motion-shimmer claim.'};
 const saveGate=()=>writeFile(resolve(output,'public-gate.json'),JSON.stringify(gate,null,2)+'\n');await saveGate();let report;
 try {
  const checkout=await verifyLiveCheckout(env);gate.checkout=checkout;
  const sources=Object.fromEntries(await Promise.all(Object.keys(derivationPins).map(async path=>[path,await readFile(resolve(root,path),'utf8')]))),derived=deriveFineLiveSources(sources);
  const generatedPaths={collector:resolve(root,'scripts/cabin-fine-live-collector.generated.mjs'),modelBody:resolve(root,'scripts/cabin-fine-live-model-body.generated.mjs'),transport:resolve(root,'scripts/cabin-fine-live-transport.generated.mjs')};
  gate.derivationSha256={};for(const [name,text]of Object.entries(derived)){await writeFile(generatedPaths[name],text);gate.derivationSha256[name]=sha256(text);}
  const transport=await import(pathToFileURL(generatedPaths.transport));gate.phase='public-preflight';await saveGate();
  const publicPreflight=await verifyFinePublicPreflight({directory:resolve(root,'dist'),commit:checkout.revision.commit,transport});
  gate.publicPreflight=publicPreflight;gate.phase='native-captures';await saveGate();
  const identity={...checkout,publicPreflight,derivationSha256:gate.derivationSha256};
  const collector=await import(pathToFileURL(generatedPaths.collector)),recorder=await import(pathToFileURL(generatedPaths.modelBody));
  report=await collector.main(env,identity);
  assertLiveCaptureReport(report,identity,env,recorder.assertComparisonModelReceipt);await verifyCaptureFiles(report,output);
  report.publicAcceptance='passed';await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');gate.status='passed';gate.phase='complete';await saveGate();return report;
 }catch(error){
  gate.status='failed';gate.errors.push({message:String(error),stack:error.stack});
  if(!report){try{report=JSON.parse(await readFile(reportPath));}catch(readError){if(readError.code!=='ENOENT')throw readError;}}
  if(report){report.result='failed';report.publicAcceptance='failed';report.errors.push({message:'Final public verification failed: '+String(error)});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
  await saveGate();throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--check-release','No public target/source/budget arguments');
 (process.argv[2]==='--check-release'?verifyLiveCheckout():main()).catch(error=>{console.error(error);process.exitCode=1;});
}
