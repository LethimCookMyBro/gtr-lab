/** Bounded read-only interaction audit. Reference failures never gate this app. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const root = 'reference-audit-results';
await mkdir(root, {recursive:true});
const result = {reference:'https://everymatrix-porchelab.netlify.app/', capturedAt:new Date().toISOString(), views:[]};
const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
try {
  for (const [name, viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
    const context = await browser.newContext({viewport, ...(name==='mobile'?{isMobile:true,hasTouch:true}:{}), deviceScaleFactor:1});
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const view = {name,viewport,events:[],errors:[]}; result.views.push(view);
    page.on('pageerror', e=>view.errors.push(e.message));
    async function capture(label) {
      await page.screenshot({path:`${root}/${name}-${label}.png`, animations:'disabled',scale:'css'});
      const visibleControls = await page.locator('button, [role="button"], input, [title]').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0 && n.getBoundingClientRect().height>0).slice(0,100).map(n=>({tag:n.tagName,text:(n.innerText||'').trim().slice(0,100),aria:n.getAttribute('aria-label'),title:n.getAttribute('title'),type:n.getAttribute('type')})));
      view.events.push({label,url:page.url(),visibleControls});
    }
    async function clickLabel(label) {
      const candidates = [page.getByRole('button',{name:label,exact:true}),page.getByRole('link',{name:label,exact:true}),page.getByText(label,{exact:true}),page.getByTitle(label,{exact:true})];
      for (const locator of candidates) {
        const first=locator.first();
        if(await first.isVisible().catch(()=>false)){await first.click();return true;}
      }
      view.events.push({unverifiedControl:label});return false;
    }
    try {
      await page.goto(result.reference,{waitUntil:'domcontentloaded',timeout:30000});
      await page.getByText('Explore in 3D',{exact:true}).first().waitFor({state:'visible',timeout:20000}).catch(()=>{});
      await capture('home');
      if(await clickLabel('Explore in 3D')) {
        await page.waitForURL('**/configurator',{timeout:20000}).catch(()=>{});
        await page.locator('canvas').first().waitFor({state:'visible',timeout:20000}).catch(()=>{});
        // Observe the real model/texture loading period rather than invent readiness from DOM text.
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        await page.waitForTimeout(1800);
        view.graphics=await page.locator('canvas').evaluateAll(canvases=>canvases.map(c=>{const gl=c.getContext('webgl2')||c.getContext('webgl');return {width:c.width,height:c.height,webgl:!!gl,lost:gl?.isContextLost(),renderer:gl?.getParameter(gl.RENDERER)};}));
        await capture('configurator');
        const canvas=page.locator('canvas').first();
        if(await canvas.isVisible()) {
          const b=await canvas.boundingBox();
          await page.mouse.move(b.x+b.width*.46,b.y+b.height*.55);await page.mouse.down();await page.mouse.move(b.x+b.width*.64,b.y+b.height*.55,{steps:16});await page.mouse.up();await page.waitForTimeout(700);
          await capture('manual-orbit');
          await page.mouse.wheel(0,-220);await page.waitForTimeout(600);await capture('manual-zoom');
        }
        if(await clickLabel('Model Detail')) {await page.waitForTimeout(450);await capture('model-detail');await page.keyboard.press('Escape');}
        for(const label of ['Camera','Environment','Lights','Sound']) {
          if(await clickLabel(label)){await page.waitForTimeout(450);await capture(label.toLowerCase());await page.keyboard.press('Escape');}
        }
        const swatch=page.locator('input[type="color"]').first();
        if(await swatch.isVisible().catch(()=>false)){await swatch.fill('#991b2b');await page.waitForTimeout(450);await capture('paint-change');}
        if(await clickLabel('Back')){await page.waitForTimeout(700);await capture('returned-home');}
      }
    } catch(e){view.errors.push(String(e));await capture('interrupted').catch(()=>{});}
    await context.close();
    await writeFile(`${root}/observations.json`,JSON.stringify(result,null,2));
  }
} finally {await browser.close();await writeFile(`${root}/observations.json`,JSON.stringify(result,null,2));}
console.log(`Reference audit saved ${result.views.length} viewport records. Review actual screenshots and unverified controls; this is not an app test result.`);
