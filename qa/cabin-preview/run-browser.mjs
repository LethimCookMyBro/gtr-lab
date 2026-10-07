import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Explicitly scoped to the separately reviewed GitHub Actions job.
assert.equal(process.env.GITHUB_ACTIONS,'true','Use the separately authorized GitHub Actions runner only');
assert.equal(process.env.R35_ALLOW_BROWSER_QA,'1','Explicit CI browser QA gate required');
const output='cabin-webgl-results';await mkdir(output,{recursive:true});
const plan=process.env.R35_QA_VIEWPORT || 'desktop';assert.ok(['desktop','mobile'].includes(plan));
const viewport=plan==='desktop'?{width:1440,height:1000}:{width:390,height:844};
const report={status:'running',qaCommit:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),viewport,plan,
  scope:'Separate Three.js inspector using exact new cabin and unchanged accepted exterior. Production app integration is not under test.',
  limitations:['SwiftShader is a software renderer. A 390px emulated viewport is not a physical Android test.','Screenshots require visual review. Functional success is not visual acceptance.','Render CPU times exclude asynchronous GPU completion.'],
  screenshots:[],checks:[],timings:[],appearanceChecks:[],errors:[],consoleErrors:[],requestFailures:[]};
const save=()=>writeFile(`${output}/${plan}-report.json`,JSON.stringify(report,null,2));
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory','.qa-cabin-runtime'],{stdio:'inherit'});
const base='http://127.0.0.1:8765/viewer/';let browser,page;
try {
  let available=false;
  for(let index=0;index<100;index++) {
    if(await fetch(base).then(response=>response.ok).catch(()=>false)){available=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(available,'Runner-local inspector responds');
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  report.browser=await browser.version();
  const context=await browser.newContext({viewport,deviceScaleFactor:1,...(plan==='mobile'?{isMobile:true,hasTouch:true}:{})});
  page=await context.newPage();page.setDefaultTimeout(120000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  const waitReady=async()=>{
    await page.waitForFunction(()=>window.__R35_QA__?.ready || window.__R35_QA__?.error,{},{timeout:180000});
    assert.equal(await page.evaluate(()=>window.__R35_QA__.error),null);
    await page.waitForFunction(()=>window.__R35_QA__.isRenderReady(4),{},{timeout:120000});
  };
  const verify=async label=>{
    const checks=await page.evaluate(()=>window.__R35_QA__.getChecks());report.checks.push({label,checks});
    for(const [key,passed] of Object.entries(checks))assert.equal(passed,true,`${label}: ${key}`);
    await save();
  };
  const capture=async label=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const image=await page.locator('#viewport canvas').screenshot({path:`${output}/${plan}-${label}.png`,timeout:120000});
    const item={file:`${plan}-${label}.png`,sha256:createHash('sha256').update(image).digest('hex'),status:'captured-unreviewed',camera:await page.evaluate(()=>window.__R35_QA__.getCameraState())};
    report.screenshots.push(item);await save();return item.sha256;
  };
  const sample=async(label,moving=false)=>{
    const timing=await page.evaluate(moving=>window.__R35_QA__.sampleFrames(24,moving),moving);
    report.timings.push({label,...timing});await save();
  };
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await waitReady();
  report.renderer=await page.evaluate(()=>window.__R35_QA__.renderer);assert.equal(report.renderer.webgl2,true);
  report.inputs=await page.evaluate(()=>window.__R35_QA__.inputManifest);
  report.initialLoad=await page.evaluate(()=>({assets:window.__R35_QA__.loadMeasurements,firstFrameSubmittedMs:window.__R35_QA__.firstFrameSubmittedMs,exteriorDerivedAppTransform:window.__R35_QA__.exteriorDerivedAppTransform}));
  await verify('initial-runtime');
  const originalExteriorCamera=await page.evaluate(()=>window.__R35_QA__.getCameraState());
  const exteriorBounds=await page.locator('#viewport canvas').boundingBox();
  await page.mouse.move(exteriorBounds.x+exteriorBounds.width*.35,exteriorBounds.y+exteriorBounds.height*.5);
  await page.mouse.down();await page.mouse.move(exteriorBounds.x+exteriorBounds.width*.7,exteriorBounds.y+exteriorBounds.height*.5,{steps:5});await page.mouse.up();
  assert.notDeepEqual((await page.evaluate(()=>window.__R35_QA__.getCameraState())).position,originalExteriorCamera.position,'Exterior orbit input moves the camera');
  await page.mouse.down({button:'right'});await page.mouse.move(exteriorBounds.x+exteriorBounds.width*.5,exteriorBounds.y+exteriorBounds.height*.7,{steps:5});await page.mouse.up({button:'right'});
  const beforeDolly=await page.evaluate(()=>window.__R35_QA__.getCameraState());
  await page.mouse.wheel(0,-9999);
  await page.waitForFunction(()=>{const state=window.__R35_QA__.getCameraState();return Math.abs(state.orbitDistance-state.orbitMinDistance)<1e-7;});
  assert.notEqual((await page.evaluate(()=>window.__R35_QA__.getCameraState())).orbitDistance,beforeDolly.orbitDistance,'Wheel input changes exterior radius');
  await page.mouse.wheel(0,9999);
  await page.waitForFunction(()=>{const state=window.__R35_QA__.getCameraState();return Math.abs(state.orbitDistance-state.orbitMaxDistance)<1e-7;});
  assert.deepEqual((await page.evaluate(()=>window.__R35_QA__.getCameraState())).orbitTarget,originalExteriorCamera.orbitTarget,'Exterior panning remains disabled');
  await verify('exterior-input-bounds');await page.getByRole('button',{name:'Exterior orbit',exact:true}).click();
  report.windowAssignments=await page.evaluate(()=>window.__R35_QA__.getWindowAssignments());assert.equal(report.windowAssignments.length,4);
  report.eyeClearance=await page.evaluate(()=>window.__R35_QA__.inspectEyeClearance());
  for(const eye of report.eyeClearance)assert.equal(eye.nearPlaneClearForAllPanDirections,true,`${eye.camera}: near plane`);
  await page.evaluate(()=>window.__R35_QA__.setGlass(false));
  const opaqueHash=await capture('exterior-source-windows');await sample('exterior-source-windows');
  await page.evaluate(()=>window.__R35_QA__.setGlass(true));
  assert.notEqual(await capture('exterior-transparent-windows'),opaqueHash,'Transparent windows change rendered pixels at a fixed camera');
  await sample('exterior-transparent-windows');
  await page.evaluate(()=>window.__R35_QA__.setGlass(false));
  assert.equal(await capture('exterior-source-windows-restored'),opaqueHash,'Window restoration returns baseline pixels');
  await page.evaluate(()=>window.__R35_QA__.setGlass(true));
  for(const view of ['driver','passenger','rear']) {
    await page.getByRole('button',{name:{driver:'Driver eye',passenger:'Passenger eye',rear:'Rear eye'}[view],exact:true}).click();
    const before=await page.evaluate(()=>window.__R35_QA__.getCameraState());assert.equal(before.view,view);
    await capture(view);await sample(`${view}-idle`);await sample(`${view}-panning`,true);
    await page.evaluate(view=>window.__R35_QA__.selectView(view),view);
    if(plan==='desktop')for(const [label,yaw,pitch] of [['left',90,0],['right',-90,0],['behind',180,0],['up',0,60],['down',0,-60]]) {
      await page.evaluate(([yaw,pitch])=>window.__R35_QA__.look(yaw,pitch),[yaw,pitch]);await capture(`${view}-${label}`);
    }
    await page.evaluate(view=>window.__R35_QA__.selectView(view),view);
    const bounds=await page.locator('#viewport canvas').boundingBox();
    await page.mouse.move(bounds.x+bounds.width*.4,bounds.y+bounds.height*.4);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.7,bounds.y+bounds.height*.6,{steps:5});await page.mouse.up();
    await page.mouse.wheel(0,3000);await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
    const after=await page.evaluate(()=>window.__R35_QA__.getCameraState());
    assert.deepEqual(after.position,before.position,`${view}: camera cannot translate`);
    assert.notDeepEqual(after.direction,before.direction,`${view}: look input changes direction`);
    for(const [yaw,pitch] of [[999,999],[-999,-999]]) {
      const edge=await page.evaluate(([yaw,pitch])=>window.__R35_QA__.look(yaw,pitch),[yaw,pitch]);
      assert.deepEqual(edge.position,before.position);assert.ok(Math.abs(edge.pan.yaw)<=180 && Math.abs(edge.pan.pitch)<=70);
    }
    await verify(`${view}-camera-controls`);
  }
  await page.evaluate(()=>window.__R35_QA__.selectView('exterior'));
  const initialAppearance=await page.evaluate(()=>window.__R35_QA__.getAppearance()),appearanceHashes={};
  const initialAppearanceHash=await capture('appearance-baseline');
  for(const [label,paint,lights] of [['paint-red','#b31625',false],['paint-red-lights-on','#b31625',true],['paint-blue-lights-on','#183f80',true],['appearance-restored',initialAppearance.paint,initialAppearance.lights]]) {
    const result=await page.evaluate(([paint,lights])=>window.__R35_QA__.setAppearance(paint,lights),[paint,lights]);
    assert.equal(result.protectedUnchanged,true);assert.equal(result.cabinBindings,0);report.appearanceChecks.push({label,...result});
    const screenshotHash=await capture(label);appearanceHashes[label]=screenshotHash;
    if(label==='paint-red-lights-on')assert.notEqual(screenshotHash,appearanceHashes['paint-red'],'Lamp toggle changes pixels with paint fixed');
    if(label==='paint-blue-lights-on')assert.notEqual(screenshotHash,appearanceHashes['paint-red-lights-on'],'Paint toggle changes pixels with lamps fixed');
    if(label==='appearance-restored')assert.equal(screenshotHash,initialAppearanceHash,'Paint/lamp restoration returns baseline pixels');
    else assert.notEqual(screenshotHash,initialAppearanceHash);
    await verify(label);
  }
  await page.evaluate(()=>window.__R35_QA__.selectExteriorRear());
  const rearOff=await capture('rear-exterior-lamps-off');
  await page.evaluate(paint=>window.__R35_QA__.setAppearance(paint,true),initialAppearance.paint);
  assert.notEqual(await capture('rear-exterior-lamps-on'),rearOff,'Rear lights alter pixels with paint fixed');
  await page.evaluate(paint=>window.__R35_QA__.setAppearance(paint,false),initialAppearance.paint);
  assert.equal(await capture('rear-exterior-lamps-restored'),rearOff,'Rear lamp restoration returns baseline pixels');await verify('rear-lamp-isolation');
  await page.evaluate(()=>{window.__R35_QA__.selectView('exterior');window.__R35_QA__.setCabinOnly(true);});
  await capture('cabin-isolated');await verify('cabin-isolated');await sample('cabin-isolated');
  await page.evaluate(()=>window.__R35_QA__.loadModel('original'));await waitReady();await capture('cabin-separate-file');await verify('cabin-separate-file');
  await page.evaluate(()=>window.__R35_QA__.loadModel('runtime'));await waitReady();
  await page.evaluate(()=>{window.__R35_QA__.setCabinOnly(false);window.__R35_QA__.selectView('driver');});
  for(let index=0;index<6;index++)await page.evaluate(index=>window.__R35_QA__.setGlass(index%2===0),index);
  await page.evaluate(()=>window.__R35_QA__.setGlass(true));await verify('repeated-window-toggles-and-reload');
  await page.evaluate(()=>Promise.all([window.__R35_QA__.loadModel('original'),window.__R35_QA__.loadModel('runtime')]));await waitReady();
  assert.equal(await page.evaluate(()=>window.__R35_QA__.model),'runtime');await verify('overlapping-load-latest-wins');
  report.finalStats=await page.evaluate(()=>window.__R35_QA__.stats);
  await page.screenshot({path:`${output}/${plan}-page.png`,fullPage:true});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.requestFailures,[]);
  report.status='functional-checks-passed-visual-review-pending';
} catch(error) {
  report.status='failed';report.failure=error.stack;process.exitCode=1;
  await page?.screenshot({path:`${output}/${plan}-failure.png`,fullPage:true}).catch(()=>{});
} finally {
  report.finishedAt=new Date().toISOString();await save();await browser?.close();server.kill('SIGTERM');
}
console.log(JSON.stringify({status:report.status,report:`${output}/${plan}-report.json`}));
