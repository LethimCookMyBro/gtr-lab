/** Small production smoke capture, independent of the longer interaction suites. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const directory='vehicle-preview-results';await mkdir(directory,{recursive:true});
const baseUrl=process.env.PREVIEW_BASE_URL||'http://127.0.0.1:4175';
const server=process.env.PREVIEW_BASE_URL?null:spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4175'},stdio:'inherit'});
let browser;const report={commit:process.env.GITHUB_SHA,baseUrl,views:[]};
const save=()=>writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
try{
 for(let attempt=0;attempt<50;attempt++){if(await fetch(baseUrl).then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 for(const [name,viewport]of[['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',...(name==='mobile'?{isMobile:true,hasTouch:true}:{})});const page=await context.newPage();page.setDefaultTimeout(15000);
  const view={name,viewport,ready:false,errors:[],console:[]};report.views.push(view);await save();
  page.on('pageerror',e=>view.errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))view.console.push({type:m.type(),text:m.text()});});
  try{
   console.log(`[preview] opening ${name}`);await page.goto(baseUrl+'/configurator/premium',{waitUntil:'domcontentloaded',timeout:30000});
   await page.getByRole('button',{name:'Ultimate Silver',exact:true}).waitFor({state:'visible',timeout:15000});
   await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="Ultimate Silver"]');return b&&!b.disabled;},{},{timeout:90000});
   view.ready=true;
  }catch(e){view.errors.push(String(e));}
  await save();console.log(`[preview] ${name} ready=${view.ready}`);
  try{await page.screenshot({path:`${directory}/${name}-licensed-r35.png`,animations:'disabled',scale:'css',timeout:15000});}catch(e){view.errors.push(`Screenshot: ${e}`);}
  if(view.ready){
   view.interactions=[];
   try{
    await page.getByRole('button',{name:'Vibrant Red',exact:true}).scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Vibrant Red',exact:true}).click();
    if(await page.getByRole('button',{name:'Vibrant Red',exact:true}).getAttribute('aria-pressed')!=='true')throw new Error('Paint selection did not update');
    view.interactions.push('Paint selection updates');
    await page.getByRole('button',{name:'Ultimate Silver',exact:true}).scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Ultimate Silver',exact:true}).click();
    await page.getByRole('button',{name:'Lights',exact:true}).click();
    if(await page.getByRole('button',{name:'Lights',exact:true}).getAttribute('aria-pressed')!=='true')throw new Error('Lamp control did not update');
    await page.getByRole('button',{name:'Lights',exact:true}).click();
    view.interactions.push('Lamp control updates');
    await page.getByRole('button',{name:'Model detail',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'visible'});
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    view.interactions.push('Detail panel opens and closes');
   }catch(e){view.errors.push(`Interaction: ${e}`);}
   view.environments=[];
   for(const [environment,label,asset]of[['forest','Forest road','tief_etz'],['coast','Coastal road','victoria_curve_01']]){
    const state={environment,ready:false};view.environments.push(state);await save();
    try{
     const responsePending=page.waitForResponse(r=>new RegExp(`/environments/${asset}(?:_1k)?\\.hdr(?:\\?|$)`).test(r.url()),{timeout:30000});
     await page.getByRole('button',{name:'Environment',exact:true}).click();
     await page.getByRole('dialog').getByRole('button',{name:new RegExp('^'+label)}).click();
     const response=await responsePending;state.assetUrl=response.url();state.httpStatus=response.status();
     if(!response.ok())throw new Error(`HDR request failed ${response.status()}`);
     const failure=await response.finished();if(failure)throw failure;
     // Wait for decode, PMREM creation and the demand-rendered scene after the real HDR response.
     await page.evaluate(()=>new Promise(resolve=>{let remaining=24;function frame(){if(--remaining<=0)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
     await page.getByRole('dialog').waitFor({state:'hidden'});
     if(await page.locator('.scene-notice').count())throw new Error(await page.locator('.scene-notice').innerText());
     state.ready=true;
     await page.screenshot({path:`${directory}/${name}-${environment}-licensed-r35.png`,animations:'disabled',scale:'css',timeout:20000});
    }catch(e){state.error=String(e);view.errors.push(`${environment}: ${e}`);}
    await save();console.log(`[preview] ${name} ${environment} ready=${state.ready}`);
   }
  }
  view.visibleText=await page.locator('body').innerText({timeout:5000}).catch(()=>'(unavailable)');await save();
  await context.close();
 }
}finally{await save();await browser?.close();server?.kill('SIGTERM');}
console.log(JSON.stringify(report));
if(report.views.some(v=>!v.ready||v.errors.length||v.environments?.some(e=>!e.ready)))process.exitCode=1;
