/** Bounded transport evidence only. No browser, renderer, deployment or acceptance mutation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {get as httpsGet} from 'node:https';
import {connect as http2Connect} from 'node:http2';
import {origin,fixedRelease,contract,transferBudget,plan,validateInvocation,userAgent} from './cabin-public-transport-policy.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const headerNames=['content-type','content-length','content-encoding','vary','cache-control','etag','date','server','x-railway-edge','x-railway-request-id'];
const safeError=error=>({name:String(error?.name??'Error').slice(0,80),code:String(error?.code??'').slice(0,80),message:String(error?.message??error).slice(0,600)});
export async function runTransfer(spec,env,deps={}){
 validateInvocation(env);assert.ok(plan.some(p=>p.index===spec.index&&p.protocol===spec.protocol&&p.path===spec.path));assert.ok(['identity','gzip'].includes(spec.encoding));
 const network={httpsGet,http2Connect,setTimer:setTimeout,clearTimer:clearTimeout,now:()=>performance.now(),...deps};
 const started=network.now(),chunks=[],wireHash=createHash('sha256');let request,response,session,finished=false,timer,received=0;
 const row={index:spec.index,protocol:spec.protocol,path:spec.path,encoding:spec.encoding,userAgent:userAgent(env,spec),expected:{wireBytes:spec.wireBytes,wireSha256:spec.wireSha256,decodedBytes:spec.decodedBytes,decodedSha256:spec.decodedSha256},budgetMs:transferBudget,status:'running',httpStatus:null,negotiatedProtocol:null,headers:{},wire:null,decoded:null,errors:[],goaway:[],resetCode:null,elapsedMs:null};
 return new Promise(done=>{
  const finish=(error,complete=false)=>{
   if(finished)return;finished=true;network.clearTimer(timer);if(error)row.errors.push(safeError(error));
   row.elapsedMs=Math.max(0,network.now()-started);if(!error&&row.elapsedMs>=transferBudget){error=deadlineError();row.errors.push(safeError(error));}row.resetCode=spec.protocol==='h2'?(response?.rstCode??null):null;row.wire={bytes:received,sha256:wireHash.digest('hex'),complete};
   if(!error)try{
    assert.equal(row.negotiatedProtocol,spec.protocol,'Exact negotiated protocol required');assert.equal(row.httpStatus,200,'HTTP200 required; no redirects');
    assert.equal(row.headers['content-encoding']??'identity',spec.encoding);assert.equal(Number(row.headers['content-length']),received);assert.match(row.headers['content-type']??'',/^(model\/gltf-binary|application\/octet-stream)(?:;|$)/i);
    assert.equal(received,spec.wireBytes,'Complete wire byte identity');assert.equal(row.wire.sha256,spec.wireSha256,'Complete wire hash identity');assert.equal(complete,true);if(spec.protocol==='h2')assert.equal(row.resetCode,0,'No HTTP2 reset');
    const wire=Buffer.concat(chunks,received),decoded=spec.encoding==='gzip'?gunzipSync(wire,{maxOutputLength:spec.decodedBytes}):wire;assert.equal(decoded.length,spec.decodedBytes);assert.equal(sha(decoded),spec.decodedSha256);row.decoded={bytes:decoded.length,sha256:sha(decoded)};
   }catch(e){row.errors.push(safeError(e));}
   row.status=row.errors.length?'failed':'passed';
   // Each planned transfer owns a fresh connection; teardown never retries an incomplete body.
   response?.destroy();request?.destroy();session?.destroy();done(row);
  };
  const deadlineError=()=>Object.assign(new Error('Original 30000ms transfer deadline exceeded'),{code:'TRANSFER_DEADLINE'});
  const fail=error=>finish(error,false);
  const active=()=>{if(finished)return false;if(network.now()-started>=transferBudget){fail(deadlineError());return false;}return true;};
  const attachBody=stream=>{
   if(!active()){stream.on('error',()=>{});stream.destroy();return;}response=stream;
   stream.on('error',fail);stream.on('aborted',()=>fail(new Error('Response aborted')));
   stream.on('data',chunk=>{if(!active())return;received+=chunk.length;wireHash.update(chunk);if(received>spec.wireBytes)fail(new Error('Wire byte cap exceeded'));else chunks.push(Buffer.from(chunk));});
   stream.on('end',()=>{if(spec.protocol==='http/1.1'&&!stream.complete)fail(new Error('Incomplete HTTP1 message'));else finish(null,true);});
   stream.on('close',()=>{if(!finished)fail(new Error('Stream closed before complete body'));});
  };
  const headers=(status,values)=>{if(!active())return;row.httpStatus=status;for(const name of headerNames)if(values[name]!==undefined)row.headers[name]=String(values[name]).slice(0,1024);if(status!==200)fail(new Error('HTTP status '+status+'; redirect/failure retained without follow'));};
  const requestHeaders={'accept-encoding':spec.encoding,'cache-control':'no-cache','user-agent':row.userAgent};
  timer=network.setTimer(()=>fail(deadlineError()),transferBudget);
  try{
   if(spec.protocol==='http/1.1'){
    request=network.httpsGet(origin+spec.path,{headers:requestHeaders,agent:false,ALPNProtocols:['http/1.1'],rejectUnauthorized:true});
    request.on('error',fail);request.on('socket',socket=>{if(!active())return;socket.once('secureConnect',()=>{if(!active())return;row.negotiatedProtocol=socket.alpnProtocol;try{assert.equal(socket.authorized,true,'TLS certificate authorization');assert.equal(socket.alpnProtocol,'http/1.1','No protocol fallback');}catch(e){fail(e);}});});
    request.on('response',stream=>{if(!active()){stream.on('error',()=>{});stream.destroy();return;}attachBody(stream);headers(stream.statusCode,stream.headers);if(stream.httpVersion!=='1.1')fail(new Error('Unexpected HTTP version '+stream.httpVersion));});
   }else{
    session=network.http2Connect(origin,{ALPNProtocols:['h2'],rejectUnauthorized:true});session.on('error',fail);session.on('close',()=>{if(!finished)fail(new Error('HTTP2 session closed before body'));});
    session.on('goaway',(code,lastStreamID,opaque)=>{if(active()){row.goaway.push({code,lastStreamID,opaqueBytes:opaque?.length??0,opaqueSha256:opaque?sha(opaque):null});if(code!==0)fail(Object.assign(new Error('HTTP2 error GOAWAY'),{code:'HTTP2_GOAWAY_'+code}));}});
    session.once('connect',()=>{if(!active())return;row.negotiatedProtocol=session.alpnProtocol;try{assert.equal(session.socket.authorized,true,'TLS certificate authorization');assert.equal(session.alpnProtocol,'h2','No protocol fallback');if(!active())return;request=session.request({':method':'GET',':path':spec.path,...requestHeaders});attachBody(request);request.on('response',values=>headers(values[':status'],values));request.end();}catch(error){fail(error);}});
   }
  }catch(error){fail(error);}
 });
}
export async function runPlan(env,save,transfer=runTransfer){
 validateInvocation(env);const transfers=[];
 for(const spec of plan){let row;try{row=await transfer(spec,env);}catch(error){row={index:spec.index,protocol:spec.protocol,path:spec.path,encoding:spec.encoding,status:'failed',errors:[safeError(error)],wire:null,decoded:null};}transfers.push(row);await save(transfers);}
 return {status:transfers.every(r=>r.status==='passed')?'passed':'incomplete',nativeDesktopAcceptance:'not-assessed',transfers};
}

import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {applicationIdentity} from './diagnose-dpr-motion.mjs';
import {sourceTree,requestPath,comparisonPath,comparisonFileSha256,helperPaths,validateRequest,validateCheckout} from './cabin-public-transport-policy.mjs';
const harnessRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),appRoot=resolve(harnessRoot,'../app');
const git=(directory,args)=>execFileSync('git',['-C',directory,...args],{encoding:'utf8'}).trim();
async function pinnedFile(directory,path,expected){const full=resolve(directory,path),info=await lstat(full);assert.ok(info.isFile()&&!info.isSymbolicLink(),path);const bytes=await readFile(full);assert.equal(sha(bytes),expected,'Exact file '+path);return bytes;}
export async function verifyCheckout(env=process.env){
 validateInvocation(env);assert.equal(resolve('.'),harnessRoot,'Run only from the exact harness checkout');assert.notEqual(appRoot,harnessRoot);
 const request=JSON.parse(await readFile(resolve(harnessRoot,requestPath)));validateRequest(request,env);
 for(const path of helperPaths)await pinnedFile(harnessRoot,path,request.helperPins[path]);
 const comparisonBytes=await pinnedFile(appRoot,comparisonPath,comparisonFileSha256),comparison=JSON.parse(comparisonBytes);assert.equal(comparison.allow,false);assert.equal(comparison.candidate.source.sha256,sourceTree);
 for(const [path,hash]of Object.entries(comparison.candidate.buildFiles)){await pinnedFile(appRoot,path,hash);await pinnedFile(harnessRoot,path,hash);}
 for(const path of ['scripts/verify-release-assets.mjs','scripts/wait-railway.mjs'])await pinnedFile(appRoot,path,request.helperPins[path]);
 const appSource=await applicationIdentity(appRoot),harnessSource=await applicationIdentity(harnessRoot);assert.deepEqual(appSource,comparison.candidate.source);assert.deepEqual(harnessSource,appSource);
 git(harnessRoot,['merge-base','--is-ancestor',fixedRelease,'HEAD']);
 const checkout={harnessCommit:git(harnessRoot,['rev-parse','HEAD']),appCommit:git(appRoot,['rev-parse','HEAD']),harnessMessage:git(harnessRoot,['log','-1','--format=%B']),harnessStatus:git(harnessRoot,['status','--porcelain','--untracked-files=no']),appStatus:git(appRoot,['status','--porcelain','--untracked-files=no']),releaseIsAncestor:true,changedFiles:git(harnessRoot,['diff','--name-only',fixedRelease,'HEAD']).split('\n')};validateCheckout(checkout,env);
 return {request,checkout,source:appSource};
}
export async function main(env=process.env){
 validateInvocation(env);assert.equal(resolve('.'),harnessRoot);const directory=resolve(harnessRoot,'cabin-public-transport-results');await mkdir(directory,{recursive:true});
 const report={contract,release:fixedRelease,harnessCommit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:1,origin,status:'running',phase:'source-gate',nativeDesktopAcceptance:'not-assessed',scope:'Six fixed-release transfers only; no desktop rendering, interaction, lifecycle or visual acceptance.',transfers:[],errors:[]};
 const save=()=>writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
 try{
  report.sourceGate=await verifyCheckout(env);report.phase='public-build-gate';await save();
  const {verifyReleaseAssets}=await import(pathToFileURL(resolve(appRoot,'scripts/verify-release-assets.mjs')));
  report.publicBuild=await verifyReleaseAssets({directory:resolve(appRoot,'dist'),commit:fixedRelease});report.phase='six-transfers';await save();
  const outcome=await runPlan(env,async transfers=>{report.transfers=[...transfers];await save();});Object.assign(report,outcome);report.phase='complete';await save();assert.equal(report.status,'passed','Incomplete transport diagnostic; failed records retained');return report;
 }catch(error){if(report.status!=='incomplete')report.status='failed';report.errors.push(safeError(error));await save();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--check-source','No URL/protocol/deadline/retry arguments');(process.argv[2]==='--check-source'?verifyCheckout():main()).catch(error=>{console.error(error);process.exitCode=1;});}
