/** Exact issued-request ownership using the existing reviewed body ledger. */
import assert from 'node:assert/strict';
import { createRuntimeBodyLedger } from './cabin-runtime-body-ledger.mjs';
import { readinessWindow } from './cabin-preparation-policy.mjs';
export function createUiReceipts({page,origin,pins,receipts,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}) {
  const ledger=createRuntimeBodyLedger({intendedAssets:pins,now,setTimer,clearTimer});
  const requests=new Map(),eventErrors=[];let generation=0,sequence=0,phase='setup';
  const guarded=work=>{try{work();}catch(error){eventErrors.push(String(error));}};
  const requestPath=request=>{const url=new URL(request.url());if(url.origin!==origin)return null;const path=(url.pathname==='/'||url.pathname.startsWith('/configurator/'))?'/index.html':url.pathname;return pins.has(path)?path:null;};
  const onRequest=request=>guarded(()=>{
    const path=requestPath(request);if(!path)return;
    const record={requestId:++sequence,generation};requests.set(request,record);
    const receipt={};receipts.push(receipt);
    ledger.issue({...record,url:request.url(),path,phase,startedAt:now(),receipt});
  });
  const onResponse=response=>guarded(()=>{
    const record=requests.get(response.request());if(!record)return;
    ledger.receive({...record,url:response.url(),status:response.status(),body:()=>response.body()});
  });
  const onFailed=request=>guarded(()=>{
    const record=requests.get(request);if(record)ledger.fail({...record,error:request.failure()?.errorText||'Original issued request failed'});
  });
  page.on('request',onRequest);page.on('response',onResponse);page.on('requestfailed',onFailed);
  const noEventErrors=()=>assert.deepEqual(eventErrors,[],'Request receipt event errors');
  return {
    async navigate(url) {
      noEventErrors();
      if(generation)await ledger.drainAndSeal({generation,window:readinessWindow(15000,now())});
      noEventErrors();ledger.beginDocument(++generation);phase=`document-${generation}`;
      await page.goto(url,{waitUntil:'domcontentloaded'});
    },
    async drain() {noEventErrors();const result=await ledger.drainAll({window:readinessWindow(15000,now())});noEventErrors();return result;},
    async finish() {noEventErrors();const result=await ledger.finish({window:readinessWindow(15000,now())});noEventErrors();return result;},
    snapshot:()=>({...ledger.snapshot(),eventErrors:[...eventErrors]}),
    stop() {page.off('request',onRequest);page.off('response',onResponse);page.off('requestfailed',onFailed);},
  };
}
