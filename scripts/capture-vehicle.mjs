/** Small production smoke capture, independent of the longer interaction suites. */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { waitForEnvironmentReady } from './vehicle-preview-readiness.mjs';
const sharedHdrPath = '/environments/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
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
  const hdrRequests = [];
  page.on('request', request => {
   const path = new URL(request.url()).pathname;
   if (/^\/environments\/.*\.hdr$/.test(path)) hdrRequests.push(path);
  });
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
   const frameHash = async label => {
    await page.waitForFunction(() => { const canvas = document.querySelector('.scene-stage canvas'); return canvas && Math.abs(canvas.width / canvas.clientWidth - Math.min(devicePixelRatio, 1.75)) < .02; }, {}, { timeout: 15000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bytes = await page.locator('.scene-stage canvas').screenshot({ path: `${directory}/${name}-${label}.png`, timeout: 45000 });
    return createHash('sha256').update(bytes).digest('hex');
   };
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
    const resetCamera = async () => {
     await page.getByRole('button', { name: 'Camera', exact: true }).click();
     await page.getByRole('dialog').getByRole('button', { name: 'Front ¾', exact: true }).click();
     await page.getByRole('dialog').waitFor({ state: 'hidden' });
    };
    await resetCamera(); const canonical = await frameHash('canonical-view');
    await page.locator('.scene-stage canvas').focus(); await page.locator('.scene-stage canvas').press('ArrowLeft');
    const manual = await frameHash('manual-orbit');
    await resetCamera(); const restored = await frameHash('restored-view');
    if (manual === canonical || restored !== canonical) throw new Error('Repeated camera request did not restore the canonical rendered view');
    view.interactions.push('Same camera preset restores exact full-resolution pixels after manual orbit');
    view.cameraReset = { canonical, manual, restored };

    await page.getByRole('button',{name:'Model detail',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'visible'});
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    view.interactions.push('Detail panel opens and closes');
   }catch(e){view.errors.push(`Interaction: ${e}`);}
   view.environments=[];
   let sharedHdr;
   for(const [environment,label]of[['forest','Test paddock'],['coast','Coastal road']]){
    const state={environment,ready:false};view.environments.push(state);await save();
    try{
     const before = await frameHash(`before-environment-${environment}`);
     const select = async () => {
      await page.getByRole('button',{name:'Environment',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:new RegExp('^'+label)}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});
     };
     if (environment === 'forest') {
      const [response] = await Promise.all([
       page.waitForResponse(r => new URL(r.url()).pathname === sharedHdrPath, { timeout: 30000 }),
       select(),
      ]);
      state.assetUrl=response.url();state.httpStatus=response.status();state.assetSource='network';
      if(!response.ok())throw new Error(`HDR request failed ${response.status()}`);
      const failure=await response.finished();if(failure)throw failure;
      const bytes = await response.body();
      if (!/^#\?(?:RADIANCE|RGBE)\s/.test(bytes.subarray(0, 16).toString())) throw new Error('HDR response is not Radiance data');
      state.assetBytes=bytes.byteLength;
      sharedHdr={url:response.url(),bytes:bytes.byteLength};
     } else {
      if (!sharedHdr) throw new Error('Coast cache verification requires a successfully loaded shared sky');
      await select();
      state.assetUrl=sharedHdr.url;state.assetBytes=sharedHdr.bytes;state.assetSource='cache';
     }
     // A cached sky does not mean coast's separate rock assets are decoded/rendered yet.
     await waitForEnvironmentReady(page, environment);
     // Keep render settling and pixel evidence after the actual readiness condition.
     await page.evaluate(()=>new Promise(resolve=>{let remaining=24;function frame(){if(--remaining<=0)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
     if (!(await page.locator('main.configurator').getAttribute('class')).split(/\s+/).includes(`environment-${environment}`)) throw new Error('Environment selection did not update');
     if(await page.locator('.scene-loading, .scene-notice, .render-error').count())throw new Error('Environment did not finish rendering cleanly');
     const after = await frameHash(`environment-${environment}-canvas`);
     if (after === before) throw new Error('Environment selection did not change rendered canvas pixels');
     Object.assign(state,{before,after,pixelsChanged:true,hdrRequests:[...hdrRequests]});
     if (hdrRequests.length !== 1 || hdrRequests[0] !== sharedHdrPath) throw new Error('Outdoor environments must fetch one shared sky and reuse its cached texture');
     await page.screenshot({path:`${directory}/${name}-${environment}-licensed-r35.png`,animations:'disabled',scale:'css',timeout:40000});
     state.ready=true;
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
