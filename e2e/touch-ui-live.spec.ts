import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { continueHomeWithout3D } from "./helpers/home-gate";
import { TouchUiAudit } from "./helpers/touch-ui-audit";
const active = new Map<TestInfo,TouchUiAudit>();
test.beforeEach(async({page},info)=>{ const audit=new TouchUiAudit(page,info);active.set(info,audit);await audit.start(); });
test.afterEach(async({},info)=>{ const audit=active.get(info);if(audit?.evidence)await audit.finish();active.delete(info); });

async function modalState(page:Page) {
  return page.evaluate(()=>{
    const dialog=document.querySelector('.drawer'),body=dialog?.querySelector('.drawer-body');
    const r=dialog?.getBoundingClientRect();
    return {dialog:r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null,
      focusInside:!!dialog?.contains(document.activeElement),background:scrollY,bodyOverflow:getComputedStyle(document.body).overflow,htmlOverflow:getComputedStyle(document.documentElement).overflow,
      style:{body:document.body.getAttribute('style'),html:document.documentElement.getAttribute('style')},
      inert:[...document.querySelectorAll('[inert]')].map(element=>({tag:element.tagName,id:element.id,value:element.getAttribute('inert')})),
      outside:[...document.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(element=>!element.closest('.drawer-layer')).map(element=>({text:(element.getAttribute('aria-label')||element.textContent||'').trim().slice(0,100),inert:!!element.closest('[inert]')})),
      targets:[...(dialog?.querySelectorAll('button,.render-quality label')||[])].map(element=>{const r=element.getBoundingClientRect();return {text:(element.getAttribute('aria-label')||element.textContent||'').trim().slice(0,100),width:r.width,height:r.height};}),
      scroll:body?{top:body.scrollTop,height:body.scrollHeight,client:body.clientHeight}:null};
  });
}
async function openDrawer(audit:TouchUiAudit,name:string) {
  const trigger=audit.page.getByRole('button',{name,exact:true});
  await trigger.focus(); await audit.tap(trigger);
  const dialog=audit.page.getByRole('dialog');
  const deadline=performance.now()+5_000;
  const left=()=>{const remaining=deadline-performance.now();if(remaining<=0)throw new Error('Original five-second drawer deadline exceeded');return remaining;};
  await expect(dialog).toHaveAttribute('data-phase','open',{timeout:left()});
  // Same existing native drawer predicate and five-second deadline; no animation cancellation.
  await expect.poll(()=>dialog.evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length),{timeout:left()}).toBe(0);
  await expect.poll(()=>dialog.evaluate(element=>getComputedStyle(element).opacity),{timeout:left()}).toBe('1');
  left();
  return {trigger,dialog};
}
async function assertDrawer(audit:TouchUiAudit,label:string) {
  const state=await modalState(audit.page),viewport=audit.page.viewportSize()!;
  audit.observations.push({label,...state});await audit.save(label);
  expect.soft(state.outside.every(control=>control.inert),'All real background controls are inert').toBe(true);
  expect.soft(state.bodyOverflow).toBe('hidden');expect.soft(state.htmlOverflow).toBe('hidden');expect.soft(state.focusInside).toBe(true);
  expect(state.dialog).not.toBeNull();
  expect.soft(state.dialog!.x).toBeGreaterThanOrEqual(-1);expect.soft(state.dialog!.y).toBeGreaterThanOrEqual(-1);
  expect.soft(state.dialog!.right).toBeLessThanOrEqual(viewport.width+1);expect.soft(state.dialog!.bottom).toBeLessThanOrEqual(viewport.height+1);
  for(const control of state.targets){expect.soft(control.width,`${control.text}: target width`).toBeGreaterThanOrEqual(43.9);expect.soft(control.height,`${control.text}: target height`).toBeGreaterThanOrEqual(43.9);}
  return state;
}

test('@home opening, menu, real gestures, invitation and footer views',async({page},info)=>{
  const audit=active.get(info)!;await audit.navigate('/');
  const initialGate=await page.locator('.home-loading-gate').getAttribute('data-state');
  await continueHomeWithout3D(page);
  audit.observations.push({label:'home-entry-path',gateBefore:initialGate,gateAfter:await page.locator('.home-loading-gate').getAttribute('data-state'),path:initialGate==='resolved'?'Already resolved before helper':'Explicit Continue without 3D helper, or readiness winning its documented click race',scope:'This UI path does not establish normal 3D preparation or film playback'});
  await expect(page.locator('#home-title')).toBeVisible();
  await expect.poll(()=>page.locator('.home-film--hero .home-film-backup').evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
  await audit.capture('home-opening');await audit.geometry('home-opening',['.home-header','#home-title','.home-hero-support']);
  const menu=page.getByRole('button',{name:'Open menu',exact:true});await menu.focus();await audit.tap(menu);
  const dialog=page.getByRole('dialog',{name:'Explore GT-R LAB'});await expect(dialog).toBeVisible();
  await audit.capture('home-menu');await audit.geometry('home-menu',['.home-menu-dialog','.home-menu-primary a']);
  await audit.tap(dialog.getByRole('button',{name:'Close menu',exact:true}));await expect(dialog).toHaveCount(0);await expect(menu).toBeFocused();
  await audit.swipe('home-forward');await audit.capture('home-after-gesture');await audit.swipe('home-reverse',undefined,'backward');
  const invitation=page.getByRole('link',{name:'Explore Premium: View in 3D',exact:true});
  await invitation.scrollIntoViewIfNeeded();
  audit.observations.push({label:'invitation-positioning',method:'Playwright scrollIntoViewIfNeeded for a bounded independent screenshot; not a claim of full-page gesture traversal'});
  await expect.poll(()=>invitation.locator('img').evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
  await audit.capture('home-invitation');await audit.geometry('home-invitation',['.home-model-invitation--premium']);
  const footer=page.locator('.home-footer');await footer.scrollIntoViewIfNeeded();
  await audit.swipe('footer-reverse',undefined,'backward');await audit.swipe('footer-forward');
  await audit.capture('home-footer');await audit.geometry('home-footer',['.home-footer','.home-footer-columns nav','.home-footer-link']);
  await audit.tap(page.getByRole('button',{name:'Back to top',exact:true}));
  await expect.poll(()=>page.evaluate(()=>scrollY),{timeout:5_000}).toBeLessThan(2);
});

test('@collection collection pictures, bounds, touch navigation and mixed breakpoint',async({page},info)=>{
  const audit=active.get(info)!;await audit.navigate('/models');
  await expect(page.getByRole('heading',{name:'Choose your expression.'})).toBeVisible();
  const first=page.locator('.model-band').first();
  await expect.poll(()=>first.locator('img').evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
  await audit.capture('collection-top');await audit.geometry('collection-top',['.site-header','.models-heading','.model-band','.band-copy','.band-action']);
  await audit.swipe('collection-forward');await audit.capture('collection-midpage');await audit.swipe('collection-reverse',undefined,'backward');
  if(audit.target.name==='tablet-768') {
    await page.setViewportSize({width:720,height:1024});
    await audit.capture('collection-720-mixed-breakpoint');await audit.geometry('collection-720',['.site-header','.models-heading','.model-band','.band-copy','.band-action']);
    await page.setViewportSize({width:audit.target.width,height:audit.target.height});
  }
  const nismo=page.getByRole('link',{name:'Explore GT-R NISMO',exact:true});
  await nismo.scrollIntoViewIfNeeded();await audit.tap(nismo);await expect(page).toHaveURL(/\/configurator\/nismo$/);
  await audit.capture('reference-configurator');
  const {trigger,dialog}=await openDrawer(audit,'Model detail');
  await assertDrawer(audit,'reference-drawer-isolation');await audit.capture('reference-model-detail');
  await audit.tap(dialog.getByRole('button',{name:'Close panel',exact:true}));await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await audit.tap(page.getByRole('link',{name:'Back to models',exact:true}));await expect(page).toHaveURL(/\/models$/);
});

test('@configurator prepared Premium, touch drawer, focus and orientation changes',async({page},info)=>{
  const audit=active.get(info)!;await audit.preparedPremium();
  await audit.geometry('premium-controls',['.config-information-header','.config-header','.config-title','.config-toolbar','.paint-rail']);
  const before=await modalState(page);const {trigger,dialog}=await openDrawer(audit,'Environment');
  await assertDrawer(audit,'environment-open');await audit.capture('environment-open');
  expect(await trigger.evaluate(element=>{element.focus({preventScroll:true});return document.activeElement!==element;}),'Native inert blocks background focus').toBe(true);
  await dialog.focus();for(const key of ['Shift+Tab','Tab','Tab','Shift+Tab']) {await page.keyboard.press(key);expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
  const body=dialog.locator('.drawer-body');await audit.swipe('drawer-forward',body);await audit.capture('environment-scrolled');
  const rotated=audit.target.width===1440?{width:1024,height:768}:{width:audit.target.height,height:audit.target.width};
  await page.setViewportSize(rotated);
  audit.observations.push({label:'orientation-change',scope:'Browser viewport orientation emulation; not a physical device sensor or Safari orientation event',viewport:rotated});
  await assertDrawer(audit,'environment-rotated');await audit.capture('environment-rotated');await audit.swipe('drawer-rotated-forward',body);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  const closed=await modalState(page);expect(closed.style).toEqual(before.style);expect(closed.inert).toEqual(before.inert);
  await page.setViewportSize({width:audit.target.width,height:audit.target.height});
  const reopened=await openDrawer(audit,'Environment');await audit.tap(reopened.dialog.getByRole('button',{name:'Close panel',exact:true}));await expect(reopened.dialog).toHaveCount(0);await expect(reopened.trigger).toBeFocused();
  const camera=await openDrawer(audit,'Camera');await assertDrawer(audit,'camera-open');await audit.capture('camera-open');await audit.tap(camera.dialog.getByRole('button',{name:'Close panel',exact:true}));await expect(camera.dialog).toHaveCount(0);
  await audit.tap(page.getByRole('link',{name:'Back to models',exact:true}));await expect(page).toHaveURL(/\/models$/);expect((await modalState(page)).inert).toEqual([]);
});
