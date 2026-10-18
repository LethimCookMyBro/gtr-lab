import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const pin=JSON.parse(await readFile('qa/vercel-responsive-20261018.json','utf8'));
assert.equal(pin.origin,'https://gtr-lab-do56-ten.vercel.app');
assert.equal(process.env.GITHUB_REPOSITORY,'LethimCookMyBro/gtr-lab');assert.equal(process.env.GITHUB_REF,'refs/heads/main');
const viewports={mobile320:[320,740,true],mobile390:[390,844,true],tablet768:[768,1024,true],tablet1024:[1024,768,true],desktop1440:[1440,900,false],landscape:[844,390,true]};
const name=process.env.GTR_VIEWPORT;assert.ok(Object.hasOwn(viewports,name));
const [width,height,touch]=viewports[name];const out=`vercel-responsive-results/${name}`;await mkdir(out,{recursive:true});
const report={origin:pin.origin,sourceCommit:pin.sourceCommit,viewport:{width,height,touch},checkedAt:new Date().toISOString(),assets:[],pages:[],networkFailures:[],errors:[],checks:[],limitations:['Software Chromium is not physical device/GPU performance.','External Flixel playback may vary and iframe load is not playback proof.']};
let browser;
try {
 for(const [path,expected] of Object.entries(pin.assets)){
  const r=await fetch(`${pin.origin}/${path}`);assert.equal(r.status,200,path);const b=Buffer.from(await r.arrayBuffer());
  const actual={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};assert.deepEqual(actual,expected,path);report.assets.push({path,...actual});
 }
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:touch,isMobile:touch,reducedMotion:'no-preference',serviceWorkers:'block'});
 const page=await context.newPage();page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(45000);
 const modelRequests=[];page.on('request',r=>{if(r.url().startsWith(pin.origin)&&r.url().includes('.glb'))modelRequests.push(r.url())});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.networkFailures.push({url:r.url(),status:r.status()})});
 async function capture(label){
  const state=await page.evaluate(()=>({url:location.href,title:document.title,overflow:document.documentElement.scrollWidth>innerWidth,canvasCount:document.querySelectorAll('canvas').length,film:document.querySelector('.home-film--hero')?.getAttribute('data-film-document'),cabin:document.querySelector('main')?.getAttribute('data-cabin-preparation'),sceneHeight:document.querySelector('.scene-stage')?.getBoundingClientRect().height}));
  report.pages.push({label,...state});await page.screenshot({path:`${out}/${label}.png`,fullPage:false,timeout:90000});assert.equal(state.overflow,false,`${label} horizontal overflow`);
 }
 async function opening(){
  await page.goto(pin.origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{const gate=document.querySelector('.home-loading-gate');return !gate?.hasAttribute('open')||gate.getAttribute('data-state')==='error'},{},{timeout:16000});
  if(await page.locator('.home-loading-gate[open]').count())await page.getByRole('button',{name:'Continue browsing',exact:true}).click();
  await page.locator('.home-loading-gate[open]').waitFor({state:'hidden'});
 }
 await opening();await page.waitForTimeout(1000);await capture('home');
 report.startupResources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,duration:r.duration})));
 assert.equal(await page.locator('.home-signature-runway canvas').count(),0,'Belowfold WebGL must not compete with opening');assert.equal(modelRequests.length,0,'No model downloads before approaching 3D');report.checks.push('No initial WebGL canvas or GLB requests');
 const trigger=page.getByRole('button',{name:'Open menu',exact:true});
 if(!touch){await trigger.hover();await page.waitForTimeout(250);const hover=await trigger.locator('.home-menu-lines').evaluate(el=>({transform:getComputedStyle(el).transform,color:getComputedStyle(el).color}));assert.notEqual(hover.transform,'none');assert.equal(hover.color,'rgb(230, 65, 73)');report.hover=hover;}
 await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').getByRole('link',{name:'Models',exact:true}).click();await page.waitForURL('**/models');await expect(page.getByRole('heading',{level:1})).toBeFocused();report.checks.push('Immediate keyboard-open then menu navigation');
 await opening();await trigger.click();await page.waitForTimeout(240);await capture('menu');await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await expect(trigger).toHaveAttribute('aria-expanded','false');
 await page.locator('.home-signature-runway').scrollIntoViewIfNeeded();await expect(page.locator('.home-signature-runway')).toHaveAttribute('data-scene-state','ready',{timeout:180000});await capture('rear-ready');
 const retained=await page.locator('.home-signature-runway canvas').elementHandle();const requestCount=modelRequests.length;
 await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.home-signature-runway').scrollIntoViewIfNeeded();assert.equal(await retained.evaluate(el=>el===document.querySelector('.home-signature-runway canvas')),true);assert.equal(modelRequests.length,requestCount);report.checks.push('Rear scene retained across reverse scroll without duplicate model request');
 for(const route of ['/models','/heritage','/about','/credits','/configurator/nismo','/configurator/tspec','/configurator/gtr50','/configurator/gt3','/configurator/formula-e']){
  await page.goto(pin.origin+route,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{level:1}).first().waitFor();await page.waitForTimeout(300);await capture(route.slice(1).replaceAll('/','-'));
 }
 // Rapid route changes must leave the final destination usable.
 for(const route of ['/models','/heritage','/credits']) await page.goto(pin.origin+route,{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();assert.equal(new URL(page.url()).pathname,'/credits');report.checks.push('Rapid sequential route navigation remains usable');
 for(const study of [false,true]){
  await page.goto(pin.origin+'/configurator/premium'+(study?'?study=2008':''),{waitUntil:'domcontentloaded'});
  await page.locator('.scene-stage canvas').waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'});await page.waitForTimeout(700);
  if(study){await expect(page.locator('main')).toHaveAttribute('data-cabin-preparation','ready');assert.equal(await page.title(),'GT-R LAB — 2008 GT-R R35 Study');}
  else{const red=page.getByRole('button',{name:'Vibrant Red',exact:true});await red.click();await expect(red).toHaveAttribute('aria-pressed','true');}
  await capture(study?'study2008':'premium');
  const camera=page.getByRole('button',{name:'Camera',exact:true});await camera.click();await page.getByRole('dialog').waitFor();await capture(study?'study-camera':'premium-camera');await page.getByRole('dialog').getByRole('button',{name:'Close panel',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 }
 if(!touch){
  await context.close();const reduced=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});const p=await reduced.newPage();await p.goto(pin.origin);await p.locator('.home-loading-gate[open]').waitFor({state:'hidden',timeout:16000});assert.equal(await p.locator('.home-film--hero iframe').count(),0);await p.getByRole('button',{name:'Open menu',exact:true}).click();await p.getByRole('dialog').getByRole('link',{name:'Models',exact:true}).click();await p.waitForURL('**/models');report.checks.push('Reduced-motion no autoplay and immediate menu navigation');await reduced.close();
 }
 assert.deepEqual(report.errors,[],'Unexpected JavaScript errors');assert.deepEqual(report.networkFailures.filter(r=>r.url.startsWith(pin.origin)),[],'Failed same-origin assets');
} finally {if(browser)await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2))}
