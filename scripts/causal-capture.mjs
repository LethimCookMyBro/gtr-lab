import assert from 'node:assert/strict';
const supported=new Set(['07-cabin-driver','08-cabin-look-mid','09-cabin-look-end','10-cabin-seats','11-cabin-idle','12-resized-look','13-resized-idle']);
const screenshotTimeout=e=>e?.name==='TimeoutError'&&/^page\.screenshot: Timeout \d+ms exceeded\./.test(e.message);
export class CausalDeadlineError extends Error { constructor(stage){super(`Original capture wall-clock budget exceeded during ${stage}`);this.name='CausalDeadlineError';} }
export async function collectCausalCapture({page,label,file,onRetry,transactions,clock=()=>performance.now(),attemptMs=45000,attempts=2}) {
  // One budget begins at the exact old screenshot invocation, not after readiness.
  const invokedAt=clock(),absoluteDeadline=invokedAt+attemptMs*attempts;
  const transaction={label,clock:'node-performance',invokedAt,absoluteDeadline,attempts:[],supported:supported.has(label),before:null,after:null};transactions.push(transaction);
  const within=async(work,deadline,stage)=>{
    const remaining=deadline-clock();if(remaining<=0)throw new CausalDeadlineError(stage);
    let timer;try {
      const result=await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new CausalDeadlineError(stage)),remaining);})]);
      if(clock()>=deadline)throw new CausalDeadlineError(stage);return result;
    }finally{clearTimeout(timer);}
  };
  for(let i=0;i<attempts;i++){
    const startedAt=i===0?invokedAt:clock(),deadline=Math.min(startedAt+attemptMs,absoluteDeadline),attempt={startedAt,deadline,api:'page.screenshot',outcome:'running'};transaction.attempts.push(attempt);
    try{
      const remaining=()=>Math.max(1,Math.floor(deadline-clock()));
      if(supported.has(label)){
        const gate=await within(()=>page.evaluate(({label,timeout})=>globalThis.__r35CausalMotion.begin(label,timeout),{label,timeout:remaining()}),deadline,'readiness start');
        transaction.pageBudget=gate;
        await within(()=>page.waitForFunction(({label,deadline})=>globalThis.__r35CausalMotion.ready(label,deadline),gate,{timeout:remaining(),polling:16}),deadline,'readiness');
      }
      transaction.before=await within(()=>page.evaluate(()=>globalThis.__r35CausalMotion.bracket()),deadline,'before bracket');
      attempt.pngStartedAt=clock();
      let png;
      try {png=await page.screenshot({path:file,timeout:remaining(),scale:'css'});}
      catch(error){attempt.error={name:error.name,message:error.message,operation:'page.screenshot'};throw error;}
      attempt.pngEndedAt=clock();if(clock()>=deadline)throw new CausalDeadlineError('PNG');
      transaction.after=await within(()=>page.evaluate(label=>globalThis.__r35CausalMotion.finish(label),label),deadline,'after bracket');
      attempt.endedAt=clock();attempt.outcome='captured';
      transaction.result=supported.has(label)?(transaction.after.valid?'stable-cabin-endpoint-observed':'insufficient-stable-bracket'):'unresolved-exterior-or-moving-pose';
      return png;
    }catch(error){
      attempt.endedAt=clock();attempt.outcome=error.name??'Error';transaction.result='insufficient';transaction.error=String(error);
      if(i+1<attempts&&attempt.error?.operation==='page.screenshot'&&screenshotTimeout(error)&&clock()<absoluteDeadline){await onRetry(error);continue;}
      throw error;
    }
  }
  assert.fail('Unreachable capture loop');
}
