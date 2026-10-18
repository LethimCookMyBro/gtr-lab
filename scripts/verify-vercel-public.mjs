import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,devices} from '@playwright/test';
const pin=JSON.parse(await readFile('qa/vercel-public-20261018.json','utf8'));
assert.equal(pin.origin,'https://gtr-lab-do56-ten.vercel.app');
assert.equal(process.env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');
assert.equal(process.env.GITHUB_REF,'refs/heads/main');
const out='vercel-public-results'; await mkdir(out,{recursive:true});
const report={origin:pin.origin,sourceCommit:pin.sourceCommit,checkedAt:new Date().toISOString(),assets:[],screens:[],limitations:['Chromium software rendering is not physical-device performance.','Iframe document load alone does not verify video playback.']};
try {
 for(const [path,expected] of Object.entries(pin.assets)) {
  const response=await fetch(`${pin.origin}/${path}`); assert.equal(response.status,200,path);
  const body=Buffer.from(await response.arrayBuffer());
  const actual={bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
  assert.deepEqual(actual,expected,path); report.assets.push({path,...actual});
 }
 for(const route of ['/configurator/premium','/configurator/premium?study=2008']) {
  const response=await fetch(pin.origin+route); assert.equal(response.status,200);
  assert.equal(createHash('sha256').update(await response.text()).digest('hex'),pin.assets['index.html'].sha256);
 }
 assert.equal((await fetch(pin.origin+'/models/does-not-exist.glb')).status,404);
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 try {
  for(const [name,settings] of [['desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}],['mobile',{...devices['iPhone 13'],defaultBrowserType:undefined,deviceScaleFactor:1}]]) {
   const context=await browser.newContext({...settings,reducedMotion:'no-preference',serviceWorkers:'block'});
   const page=await context.newPage(); page.setDefaultTimeout(180000);
   const errors=[]; const failed=[]; page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})});
   for(const [label,path] of [['home','/'],['premium','/configurator/premium'],['study2008','/configurator/premium?study=2008']]) {
    await page.goto(pin.origin+path,{waitUntil:'domcontentloaded'});
    if(label==='home') {
     await page.locator('.home-loading-gate[open]').waitFor({state:'hidden'});
     await page.waitForTimeout(12000);
    } else {
     await page.locator('.scene-stage canvas').waitFor({state:'visible'});
     await page.locator('.scene-loading').waitFor({state:'hidden'});
     if(label==='study2008') await page.waitForFunction(()=>document.querySelector('main')?.getAttribute('data-cabin-preparation')==='ready');
     else await page.getByRole('button',{name:'Ultimate Silver',exact:true}).waitFor({state:'visible'});
     await page.waitForTimeout(2000);
    }
    const screenshot=`${name}-${label}.png`;
    await page.screenshot({path:`${out}/${screenshot}`,fullPage:false,timeout:90000});
    const state=await page.evaluate(()=>({url:location.href,title:document.title,overflow:document.documentElement.scrollWidth>innerWidth,canvasCount:document.querySelectorAll('canvas').length,filmState:document.querySelector('.home-film--hero')?.getAttribute('data-film-state'),cabin:document.querySelector('main')?.getAttribute('data-cabin-preparation')}));
    report.screens.push({name,label,screenshot,...state,errors:[...errors],failed:[...failed]});
    assert.equal(state.overflow,false,`${name} ${label} horizontal overflow`);
    assert.equal(errors.length,0,`${name} ${label} JavaScript errors`);
   }
   await context.close();
  }
 } finally {await browser.close()}
} finally {await writeFile(`${out}/report.json`,JSON.stringify(report,null,2))}
