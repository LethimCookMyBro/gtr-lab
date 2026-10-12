/** One-model adaptation of the established cabin preparation/integration CDP recorder.
 * Preserve its same-session Network.enable -> loadingFinished -> getResponseBody path.
 * No routing, extra fetch, retry, deadline or general-purpose network subsystem. */
import assert from 'node:assert/strict';
import { networkBuffers } from './cabin-preparation-network.mjs';
import { sha256 } from './cabin-preparation-policy.mjs';
export { networkBuffers };
const baseOrigin='http://127.0.0.1:4178';
const clone=value=>JSON.parse(JSON.stringify(value));
export function assertComparisonModelReceipt(evidence,model,ledgerRows) {
  assert.equal(evidence.version,1);assert.deepEqual(evidence.buffers,networkBuffers);assert.deepEqual(evidence.errors,[]);
  assert.equal(evidence.baseUrl,baseOrigin);assert.deepEqual(evidence.model,model);
  const n=evidence.native,p=evidence.playwright,b=evidence.body,url=baseOrigin+model.path;
  assert.ok(n&&p&&b);assert.ok(typeof n.requestId==='string'&&n.requestId.length>0);
  assert.equal(n.url,url);assert.equal(n.method,'GET');assert.equal(n.status,200);assert.equal(n.cached,false);assert.equal(n.terminal,'finished');
  assert.ok(n.requestSequence<n.responseSequence&&n.responseSequence<n.finishedSequence&&n.finishedSequence<b.completedSequence);
  assert.ok(Number.isSafeInteger(n.encodedTotalBytes)&&n.encodedTotalBytes>=model.gzipBytes);
  assert.equal(n.headers['content-encoding'],'gzip');assert.equal(Number(n.headers['content-length']),model.gzipBytes);
  assert.ok(Number.isSafeInteger(p.requestId)&&p.requestId>0&&Number.isSafeInteger(p.generation)&&p.generation>0);
  assert.equal(p.url,url);assert.equal(p.method,'GET');assert.equal(p.status,200);assert.equal(p.bodyRequested,true);
  assert.equal(b.nativeRequestId,n.requestId);assert.equal(b.source,'CDP.Network.getResponseBody');assert.equal(b.base64Encoded,true);assert.equal(b.bytes,model.bytes);assert.equal(b.sha256,model.sha256);
  const rows=ledgerRows.filter(r=>r.path===model.path);assert.equal(rows.length,1,'Exactly one actual browser cabin request must own the native body');
  const row=rows[0];assert.equal(row.requestId,p.requestId);assert.equal(row.generation,p.generation);assert.equal(row.url,url);assert.equal(row.status,200);assert.equal(row.state,'body-completed');assert.equal(row.bytes,b.bytes);assert.equal(row.sha256,b.sha256);assert.equal(row.error,undefined);
}
export async function captureActualComparisonCabinResponse({cdp,model,baseUrl,phase}) {
  assert.equal(baseUrl,baseOrigin);assert.ok(model.path.startsWith('/models/')&&model.path.endsWith('.glb'));
  assert.ok(Number.isSafeInteger(model.bytes)&&model.bytes>0&&model.bytes<networkBuffers.maxResourceBufferSize);assert.match(model.sha256,/^[a-f0-9]{64}$/);
  const url=baseUrl+model.path,state={version:1,buffers:{...networkBuffers},baseUrl,model:{...model},native:null,playwright:null,body:null,errors:[]};
  let sequence=0,resolveBody,rejectBody;
  const bodyPromise=new Promise((resolve,reject)=>{resolveBody=resolve;rejectBody=reject;});
  // Retain the original rejected promise for the ledger; avoid an unhandled rejection
  // if native failure is delivered before Playwright's response callback.
  bodyPromise.catch(()=>{});
  const fail=error=>{state.errors.push(String(error));rejectBody(error);};
  const checked=work=>{try{return work();}catch(error){fail(error);throw error;}};
  const on=(name,work)=>cdp.on(name,event=>{try{sequence++;work(event);}catch(error){fail(error);}});
  const relevant=value=>new URL(value).pathname===model.path;
  on('Network.requestWillBeSent',event=>{
    if(!relevant(event.request.url)&&event.requestId!==state.native?.requestId)return;
    assert.equal(state.native,null,'Duplicate native cabin request');assert.ok(typeof event.requestId==='string'&&event.requestId.length>0);
    assert.equal(event.request.url,url);assert.equal(event.request.method,'GET');assert.equal(event.redirectResponse,undefined,'The exact model cannot redirect');
    state.native={requestId:event.requestId,url,method:event.request.method,phase:phase(),requestSequence:sequence};
  });
  on('Network.responseReceived',event=>{
    if(!relevant(event.response.url)&&event.requestId!==state.native?.requestId)return;
    const n=state.native;assert.ok(n&&event.requestId===n.requestId,'Native model response must bind its issued request');assert.equal(n.responseSequence,undefined,'Duplicate native model response');
    assert.equal(event.response.url,url);assert.equal(event.response.status,200);const cached=Boolean(event.response.fromDiskCache||event.response.fromServiceWorker||event.response.fromPrefetchCache);assert.equal(cached,false);
    const headers=Object.fromEntries(Object.entries(event.response.headers??{}).map(([key,value])=>[key.toLowerCase(),String(value)]));
    assert.equal(headers['content-encoding'],'gzip');assert.equal(Number(headers['content-length']),model.gzipBytes);
    Object.assign(n,{status:200,cached,headers,responseSequence:sequence});
  });
  on('Network.loadingFailed',event=>{if(event.requestId!==state.native?.requestId)return;state.native.terminal='failed';state.native.failure=event.errorText;throw new Error('Actual native cabin request failed: '+event.errorText);});
  on('Network.loadingFinished',event=>{
    if(event.requestId!==state.native?.requestId)return;
    const n=state.native;assert.equal(n.terminal,undefined,'Duplicate native model completion');assert.ok(n.responseSequence);assert.equal(n.status,200);
    assert.ok(Number.isSafeInteger(event.encodedDataLength)&&event.encodedDataLength>=model.gzipBytes);
    Object.assign(n,{terminal:'finished',finishedSequence:sequence,encodedTotalBytes:event.encodedDataLength});
    // This is the unchanged established ownership boundary: read immediately on
    // the SAME session whose Network.enable retained this native request's body.
    (async()=>{try{
      const result=await cdp.send('Network.getResponseBody',{requestId:event.requestId});
      assert.equal(result.base64Encoded,true);assert.equal(typeof result.body,'string');assert.equal(result.body.length,Math.ceil(model.bytes/3)*4);
      const bytes=Buffer.from(result.body,'base64');assert.equal(bytes.toString('base64'),result.body,'Malformed native base64');assert.equal(bytes.length,model.bytes);assert.equal(sha256(bytes),model.sha256);
      state.body={nativeRequestId:event.requestId,source:'CDP.Network.getResponseBody',base64Encoded:true,bytes:bytes.length,sha256:sha256(bytes),completedSequence:++sequence};
      if(state.errors.length)throw new Error('Native receipt has a retained earlier failure');resolveBody(bytes);
    }catch(error){fail(error);}})();
  });
  await cdp.send('Network.enable',networkBuffers);await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  return Object.freeze({
    bindRequest(value){return checked(()=>{assert.equal(state.playwright,null,'Duplicate browser cabin request');assert.ok(Number.isSafeInteger(value.requestId)&&value.requestId>0&&Number.isSafeInteger(value.generation)&&value.generation>0);assert.equal(value.url,url);assert.equal(value.method,'GET');state.playwright={...value,bodyRequested:false};});},
    readBody(value){return checked(()=>{const p=state.playwright;assert.ok(p);assert.equal(p.bodyRequested,false,'Native body cannot be rebound to another response');for(const key of ['requestId','generation','url'])assert.equal(value[key],p[key]);assert.equal(value.status,200);Object.assign(p,{status:value.status,bodyRequested:true});return bodyPromise;});},
    snapshot(){return clone(state);},
  });
}
