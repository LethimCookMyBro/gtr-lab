/** Node transport receipts preserve the original calls, parameters, waits and timeout choices. */
export function tracePage(page,ledger,clock=()=>performance.now()){
  let command=0;
  const cache=new WeakMap();
  const wrap=(object,path)=>{
    if(cache.has(object))return cache.get(object);
    const proxy=new Proxy(object,{get(target,key){
      const value=Reflect.get(target,key,target);
      if(key==='mouse')return wrap(value,`${path}.mouse`);
      if(key==='constructor')return value; // Playwright expectTypes checks Locator.constructor.name.
      if(typeof value!=='function')return value;
      return (...args)=>{
        const next=`${path}.${String(key)}`;
        if(['locator','getByRole','getByText','getByLabel'].includes(key))return wrap(value.apply(target,args),`${next}(${JSON.stringify(args)})`);
        if(['move','down','up','click','press','focus','waitForTimeout','setViewportSize'].includes(key)){
          const record={id:++command,path:next,args,startedAt:clock(),clock:'node-performance',outcome:'running'};ledger.push(record);
          return Promise.resolve().then(()=>value.apply(target,args)).then(result=>{record.endedAt=clock();record.outcome='completed';return result;},error=>{record.endedAt=clock();record.outcome='failed';record.error=String(error);throw error;});
        }
        return value.apply(target,args);
      };
    }});cache.set(object,proxy);return proxy;
  };
  return wrap(page,'page');
}
