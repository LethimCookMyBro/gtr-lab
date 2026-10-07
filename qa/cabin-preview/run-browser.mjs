import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureEvidenceChecks, withCaptureDeadline } from './viewer/runtime-core.js';

// Explicitly scoped to the separately reviewed GitHub Actions job.
assert.equal(process.env.GITHUB_ACTIONS,'true','Use the separately authorized GitHub Actions runner only');
assert.equal(process.env.R35_ALLOW_BROWSER_QA,'1','Explicit CI browser QA gate required');
const output='cabin-webgl-results';await mkdir(output,{recursive:true});
const plan=process.env.R35_QA_VIEWPORT || 'desktop';assert.ok(['desktop','mobile'].includes(plan));
const focus=process.env.R35_QA_FOCUS || 'full';assert.ok(['full','remaining-desktop','transmission-desktop','sealed-visual'].includes(focus));
if(['remaining-desktop','transmission-desktop'].includes(focus))assert.equal(plan,'desktop');
const viewport=plan==='desktop'?{width:1440,height:1000}:{width:390,height:844};
const baseline=JSON.parse(await readFile(new URL('./reference-baseline.json',import.meta.url),'utf8'));
assert.equal(baseline.commit,'93d4fda63915c64ff1b3a8d852128fba667873f0');
assert.equal(createHash('sha256').update(await readFile(new URL('./camera-contract.json',import.meta.url))).digest('hex'),baseline.cameraContractSha256,'Camera contract remains identical to the measured baseline');
assert.deepEqual(viewport,baseline.plans[plan].viewport);
const report={focus,coverage:{fullSpatialVisualSet:focus==='full',priorRun:37595560874,priorCommit:'91ae99c74791d7b459dd8a624cbc031009789908',skipped:focus==='full'?[]:['completed driver/front views','drag/wheel/key input bursts','passenger sweeps','rear-down view','spatial full-page capture','cabin separate-file capture','paint/lamp-toggle cases','reload/overlap cases'],note:focus==='full'?'Full original visual sequence':'Targeted continuation; preserves the earlier failed run and does not claim the omitted checks were rerun'},baselineCommit:baseline.commit,baselineComparison:[],status:'running',qaCommit:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),viewport,plan,
  scope:'Separate Three.js inspector using exact new cabin and unchanged accepted exterior. Production app integration is not under test.',
  limitations:['SwiftShader is a software renderer. A 390px emulated viewport is not a physical Android test.','Screenshots require visual review. Functional success is not visual acceptance.','Render CPU times exclude asynchronous GPU completion.'],
  screenshots:[],captureStages:[],dirtyChecks:[],checks:[],timings:[],appearanceChecks:[],errors:[],consoleErrors:[],requestFailures:[]};
if(focus==='transmission-desktop') {
  report.coverage={fullSpatialVisualSet:false,priorRun:37601107213,priorCommit:'989eac52ed6c130d3f9c22ab76a0b2de92a1d707',skipped:['full 51-view visual set','closure/near-plane ray repetitions','input bursts','model reloads','global/spatial timing comparison','paint/lamp-toggle cases'],note:'Single-variable transmission target resolution diagnostic; previous geometry and input evidence is retained, not rerun'};
  report.limitations.push('One non-counterbalanced timing block per scale is directional evidence, not a general speedup benchmark. Half-scale transmission changes through-window image quality while retaining the full main canvas.');
}
if(focus==='sealed-visual') {
  report.coverage={fullSpatialVisualSet:false,priorRun:37601107213,priorCommit:'989eac52ed6c130d3f9c22ab76a0b2de92a1d707',skipped:['full 51-view sweep','input bursts','global control renders','all continuous performance samples'],note:'Six targeted scale-1 captures across two viewport jobs; sealed geometry and prior exact diagnostic pair are separate assets'};
  report.performance={status:'not-run',reason:'Visual acceptance only; no repeated SwiftShader performance blocks or production hardware claim'};
}
const save=()=>writeFile(`${output}/${plan}-report.json`,JSON.stringify(report,null,2));
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory','.qa-cabin-runtime'],{stdio:'inherit'});
const base='http://127.0.0.1:8765/viewer/';let browser,page,capture;
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
  page.on('crash',()=>report.errors.push('Browser page crashed'));
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
  const mutate=async(method,args=[])=>{
    const change=await page.evaluate(({method,args})=>{
      const qa=window.__R35_QA__,before=qa.getCaptureState().sceneRevision;
      const result=qa[method](...args);
      return {result,before,after:qa.getCaptureState().sceneRevision};
    },{method,args});
    assert.ok(change.after>change.before,`${method}: scene invalidation advances`);
    report.dirtyChecks.push({method,before:change.before,after:change.after});
    return change.result;
  };
  capture=async(label,scope='canvas',baselineLabel=label)=>{
    const stage=async(name,evidence)=>{report.captureStages.push({label,stage:name,at:new Date().toISOString(),...evidence});await save();};
    const deadline=Date.now()+120000;
    const remaining=()=>Math.max(1,deadline-Date.now());
    const bounded=(name,operation)=>withCaptureDeadline(operation,`${label}: ${name}`,remaining());
    let before,pauseAttempted=false,primaryError=null;
    await stage('begin',{});
    try {
      pauseAttempted=true;
      before=await bounded('pause',page.evaluate(()=>window.__R35_QA__.beginCapture()));
      await stage('render-submissions-paused',{state:before});
      await stage('fresh-frame-and-gpu-completion-start',{});
      const rendered=await bounded('render and GPU completion',page.evaluate(()=>window.__R35_QA__.renderCaptureFrame()));
      await stage('fresh-frame-gpu-complete',{state:rendered});
      await bounded('presentation callbacks',page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
      const settled=await bounded('settled state',page.evaluate(()=>window.__R35_QA__.getCaptureState()));
      const checks=captureEvidenceChecks(before,settled);
      for(const [key,passed] of Object.entries(checks))assert.equal(passed,true,`${label}: ${key}`);
      const clip=settled.bounds;
      assert.ok(clip.x>=0 && clip.y>=0 && clip.width>0 && clip.height>0 && clip.x+clip.width<=viewport.width+0.01 && clip.y+clip.height<=viewport.height+0.01,'Capture bounds lie inside fixed viewport');
      await stage('page-screenshot-start',{scope,bounds:clip});
      // Direct page clipping does not invoke locator scrolling or its RAF stability waiter.
      const image=await page.screenshot({path:`${output}/${plan}-${label}.png`,...(scope==='canvas'?{clip}:{}),scale:'css',timeout:remaining()});
      const after=await bounded('post-PNG state',page.evaluate(()=>window.__R35_QA__.getCaptureState()));
      const finalChecks=captureEvidenceChecks(before,after);
      if(focus==='transmission-desktop') {
        assert.deepEqual(after.transmission,settled.transmission,`${label}: transmission observation stays fixed through PNG`);
        assert.equal(before.transmission.scale,after.transmission.scale,`${label}: transmission scale stays fixed during capture`);
        assert.deepEqual(before.transmission.drawingBuffer,after.transmission.drawingBuffer,`${label}: full canvas stays fixed during capture`);
        checkTransmission(after,after.transmission.scale);
      }
      for(const [key,passed] of Object.entries(finalChecks))assert.equal(passed,true,`${label}: ${key} after PNG`);
      const item={file:`${plan}-${label}.png`,sha256:createHash('sha256').update(image).digest('hex'),status:'captured-unreviewed',camera:after.camera,captureState:after,captureChecks:finalChecks,scope};
      assert.equal(after.viewLabel,after.camera.view==='exterior'?'EXTERIOR ORBIT':`${after.camera.view.toUpperCase()} / FIXED EYE`,`${label}: camera label matches current view`);
      assert.equal(after.selectedView,after.camera.view,`${label}: selected camera matches rendered view`);
      const reference=baseline.plans[plan].screenshots.find(value=>value.file===`${plan}-${baselineLabel}.png`);
      if(reference) {
        const pose=Object.fromEntries(Object.entries(after.camera).filter(([key])=>Object.hasOwn(reference.camera,key)));
        assert.deepEqual(pose,reference.camera,`${label}: same camera as original baseline`);
        for(const key of ['canvas','appearance','glass','cabinOnly']) {
          const expected=key==='glass' && label==='rear-exterior-source-windows'?false:reference[key];
          assert.deepEqual(after[key],expected,`${label}: expected ${key} at original baseline camera`);
        }
        report.baselineComparison.push({file:item.file,baselineFile:reference.file,sameControls:label!=='rear-exterior-source-windows',controlDifference:label==='rear-exterior-source-windows'?{glass:{baseline:reference.glass,candidate:false}}:null,baselineSha256:reference.sha256,candidateSha256:item.sha256,sameCamera:true,
          sameRenderSettings:focus!=='transmission-desktop' || after.transmission.scale===1,renderSettingDifference:focus==='transmission-desktop' && after.transmission.scale!==1?{transmissionResolutionScale:{baseline:1,candidate:after.transmission.scale}}:null,baselineCounters:reference.rendererCounters,candidateCounters:after.rendererCounters});
        if(baselineLabel==='cabin-isolated')assert.ok(after.rendererCounters.calls<reference.rendererCounters.calls,'Batching reduces measured isolated-cabin draw submissions');
      } else assert.equal(label,'failure','Every planned capture has an original baseline reference');
      report.screenshots.push(item);await stage('page-screenshot-complete',{file:item.file});return item.sha256;
    } catch(error) {
      primaryError=error;
      if(error.name==='CaptureStageTimeout' || error.name==='TimeoutError')report.captureOperationUncertain=true;
      await stage('failed',{error:error.stack});throw error;
    } finally {
      if(pauseAttempted) {
        try {
          const resumed=await withCaptureDeadline(page.evaluate(()=>window.__R35_QA__.resumeAfterCapture()),`${label}: resume`,30000);
          await page.waitForFunction(previous=>{const state=window.__R35_QA__.getCaptureState();return !state.capturePaused && state.modelGeneration===previous.modelGeneration && state.continuousFrameSerial>previous.continuousFrameSerial;},resumed,{timeout:30000});
          await stage('demand-render-resumed',{state:await withCaptureDeadline(page.evaluate(()=>window.__R35_QA__.getCaptureState()),`${label}: resumed state`,30000)});
        } catch(error) {
          report.captureCleanupFailed=true;await stage('resume-failed',{error:error.stack});
          if(!primaryError)throw error;
        }
      }
    }
  };
  const sample=async(label,moving=false,comparison=null)=>{
    report.performancePhase={label,status:'running'};await save();
    try {
      const timing=await withCaptureDeadline(page.evaluate(moving=>window.__R35_QA__.sampleFrames(24,moving),moving),`${label}: continuous timing sample`,120000);
      report.timings.push({label,comparison,...timing});await save();
      if(focus==='transmission-desktop') {
        checkTransmission({...comparison.setup.state,transmission:timing.transmission},comparison.scale);
        assert.equal(timing.samples,24,'Both transmission scales submit the same 24 frames');
        for(const frame of timing.frames) {assert.equal(frame.calls,comparison.counters.calls);assert.equal(frame.triangles,comparison.counters.triangles);}
        if(report.timings.length===2) {
          assert.deepEqual(timing.drawCalls,report.timings[0].drawCalls,'Scale changes no draw submissions');
          assert.deepEqual(timing.renderedTriangles,report.timings[0].renderedTriangles,'Scale changes no rendered triangles');
        }
      }
      assert.equal(timing.gpuCompletion.status,'completed',`${label}: all sampled GPU work completed`);
      report.performancePhase={label,status:'completed'};await save();
    } catch(error) {
      report.performanceIncomplete=true;
      report.performancePhase={label,status:'failed',error:error.stack};
      await withCaptureDeadline(page.evaluate(()=>window.__R35_QA__.getTimingState()),`${label}: partial timing evidence`,10000).then(state=>{report.partialTiming=state;},diagnosticError=>{report.partialTimingError=diagnosticError.message;});
      await save();throw error;
    }
  };
  await page.goto(focus==='sealed-visual'?`${base}?model=sealed`:base,{waitUntil:'domcontentloaded',timeout:120000});await waitReady();
  report.renderer=await page.evaluate(()=>window.__R35_QA__.renderer);assert.equal(report.renderer.webgl2,true);
  report.inputs=await page.evaluate(()=>window.__R35_QA__.inputManifest);
  report.initialLoad=await page.evaluate(()=>({assets:window.__R35_QA__.loadMeasurements,firstFrameSubmittedMs:window.__R35_QA__.firstFrameSubmittedMs,exteriorDerivedAppTransform:window.__R35_QA__.exteriorDerivedAppTransform}));
  const inspectLoadedGeometry=async()=>{
  report.windowAssignments=await page.evaluate(()=>window.__R35_QA__.getWindowAssignments());assert.equal(report.windowAssignments.length,4);
  report.eyeClearance=await page.evaluate(()=>window.__R35_QA__.inspectEyeClearance());
  for(const eye of report.eyeClearance)assert.equal(eye.nearPlaneClearForAllPanDirections,true,`${eye.camera}: near plane`);
  const closureFixtures=JSON.parse(await readFile(new URL('./closure-fixtures.json',import.meta.url),'utf8'));
  report.closureRays=await page.evaluate(fixtures=>window.__R35_QA__.inspectClosureRays(fixtures),closureFixtures);
  for(const [mode,result] of Object.entries(report.closureRays)) {
    assert.equal(result.total,14,`${mode}: exact known leak fixtures`);assert.equal(result.closed,14,`${mode}: known leaks closed`);
    assert.equal(result.apertureSamples,826,`${mode}: exact original glazing fixture count`);assert.equal(result.aperturePreserved,826,`${mode}: genuine windows remain open`);
    assert.equal(result.passed,true,`${mode}: closure/glazing rays`);
  }
  await save();
  };
  const checkTransmission=(state,scale)=>{
    const diagnostics=state.transmission;
    assert.equal(diagnostics.scale,scale);
    assert.deepEqual(diagnostics.drawingBuffer,{width:state.canvas.width,height:state.canvas.height},'Main drawing buffer stays full-sized');
    assert.equal(diagnostics.observedSceneRevision,state.sceneRevision,'Observations belong to the current submitted scene');
    if(!state.glass)assert.deepEqual(diagnostics.observedTargets,[],'Source windows have no transmission pass');
    else {
      // This is a deliberately strict observation gate, not an inferred size. The
      // public window callback is unavailable on Three r180's MSRTT fast path.
      assert.equal(report.renderer.multisampledRenderToTexture,false,'Actual target observation requires the tested non-MSRTT window backface path');
      assert.ok(diagnostics.observedTargets.length>0,'Physical windows produce an actually observed intermediate target');
      for(const target of diagnostics.observedTargets) {
        assert.equal(target.width,state.canvas.width*scale);assert.equal(target.height,state.canvas.height*scale);
        assert.ok(target.windowNames.length>0);for(const name of target.windowNames)assert.ok(report.windowAssignments.some(window=>window.name===name),'Only the four classified windows observe the target');
      }
    }
  };
  await verify('initial-runtime');
  if(focus==='sealed-visual') {
    assert.equal(await page.evaluate(()=>window.__R35_QA__.model),'sealed');
    assert.equal(report.initialLoad.assets.find(asset=>asset.file!=='ciasny-r35.glb').sha256,'3302157a1d5986aca0d263eb991f1f6dd08ffc9dcfa9f7680a3b0de29f2a7dfd');
    assert.equal(await page.evaluate(()=>window.__R35_QA__.getTransmissionDiagnostics().scale),1,'Full-quality transmission retained');
    await inspectLoadedGeometry();
    const seamFixtures=JSON.parse(await readFile(new URL('./seam-fixtures.json',import.meta.url),'utf8'));
    report.seamRays=await page.evaluate(fixtures=>window.__R35_QA__.inspectClosureRays(fixtures),seamFixtures);
    for(const [mode,result] of Object.entries(report.seamRays)) {
      assert.equal(result.total,seamFixtures.expectedCounts.closures,`${mode}: exact selected seam fixtures`);
      assert.equal(result.closed,result.total,`${mode}: documented interface leaks are closed`);
      assert.equal(result.passed,true,`${mode}: sealed interface regression`);
    }
    // Batch control checks into one event-loop turn so no input burst can queue
    // many redundant GPU frames before the next completed screenshot.
    report.controlRegression=await page.evaluate(()=>{
      const qa=window.__R35_QA__,original=qa.getAppearance(),before=qa.getCaptureState().sceneRevision,checks=[];
      for(const [paint,lights] of [['#b31625',false],['#b31625',true],[original.paint,original.lights]])checks.push(qa.setAppearance(paint,lights));
      qa.setGlass(false);const restored=qa.getChecks();qa.setGlass(true);
      for(const view of ['driver','passenger','rear']) {qa.selectView(view);qa.look(999,999);checks.push({camera:qa.getCameraState(),checks:qa.getChecks()});qa.selectView(view);}
      return {before,after:qa.getCaptureState().sceneRevision,checks,restored,finalAppearance:qa.getAppearance(),original};
    });
    assert.ok(report.controlRegression.after>report.controlRegression.before);
    assert.deepEqual(report.controlRegression.finalAppearance,report.controlRegression.original);
    for(const item of report.controlRegression.checks) {
      if(item.camera) {assert.ok(Math.abs(item.camera.pan.yaw)<=180&&Math.abs(item.camera.pan.pitch)<=70);for(const value of Object.values(item.checks))assert.equal(value,true);}
      else {assert.equal(item.protectedUnchanged,true);assert.equal(item.cabinBindings,0);}
    }
    for(const value of Object.values(report.controlRegression.restored))assert.equal(value,true);
    if(plan==='desktop') {
      await mutate('selectView',['driver']);await mutate('look',[90,0]);await capture('driver-left');await verify('sealed-driver-left');
      await mutate('selectView',['passenger']);await mutate('look',[-90,0]);await capture('passenger-right');await verify('sealed-passenger-right');
      await mutate('selectView',['exterior']);await mutate('setGlass',[false]);await capture('exterior-source-windows');await verify('sealed-front-roof-source-windows');
      await page.evaluate(()=>window.__R35_QA__.selectExteriorRear());await capture('rear-exterior-source-windows','canvas','rear-exterior-lamps-off');await verify('sealed-rear-glass-source-windows');
    } else {
      for(const view of ['driver','rear']) {await mutate('selectView',[view]);await capture(view);await verify(`sealed-mobile-${view}`);}
    }
    report.allVisualChecksCompletedAt=new Date().toISOString();
    assert.equal(report.timings.length,0,'Visual-only check has no continuous timing blocks');
    assert.equal(await page.evaluate(()=>window.__R35_QA__.getTransmissionDiagnostics().scale),1,'Full-quality transmission stays unchanged');
  } else if(focus==='transmission-desktop') {
    report.windowAssignments=await page.evaluate(()=>window.__R35_QA__.getWindowAssignments());assert.equal(report.windowAssignments.length,4);
    assert.equal(report.initialLoad.assets.find(asset=>asset.file!=='ciasny-r35.glb').sha256,'111457de471188208c934e982cbcb076b37417f302560cfbab4b8d88ed092be8');
    report.comparisonProtocol={variable:'renderer.transmissionResolutionScale',scales:[0.5,1],sameLoadedScene:true,sameGeometryMaterialsAndCamera:true,sameMainCanvas:true,assetSha256:'111457de471188208c934e982cbcb076b37417f302560cfbab4b8d88ed092be8',samplesPerCase:24,repeatsPerCase:1,counterbalanced:false,note:'Half scale first, full scale last. Existing 90s GPU fence and 120s sample limit retained. Actual intermediate dimensions are observed; through-glass pixels require review.'};
    await mutate('selectView',['exterior']);await mutate('setGlass',[false]);
    await mutate('setTransmissionResolutionScale',[1]);
    const opaqueHash=await capture('transmission-opaque-full','canvas','exterior-source-windows');
    const opaqueCounters=report.screenshots.at(-1).captureState.rendererCounters;
    await mutate('setTransmissionResolutionScale',[0.5]);
    assert.equal(await capture('transmission-opaque-half','canvas','exterior-source-windows'),opaqueHash,'Negative control: source-window PNG is byte-identical across scales');
    assert.deepEqual(report.screenshots.at(-1).captureState.rendererCounters,opaqueCounters,'Negative control counters are identical');
    await mutate('setGlass',[true]);await mutate('setTransmissionResolutionScale',[1]);
    const physicalHash=await capture('transmission-exterior-full','canvas','exterior-transparent-windows');
    await mutate('setTransmissionResolutionScale',[0.5]);
    await capture('transmission-exterior-half','canvas','exterior-transparent-windows');
    await mutate('setTransmissionResolutionScale',[1]);
    assert.equal(await capture('transmission-exterior-restored','canvas','exterior-transparent-windows'),physicalHash,'Full-scale restoration returns byte-identical physical-window pixels');
    await mutate('selectView',['driver']);
    await capture('transmission-driver-full','canvas','driver');
    const driverCounters=report.screenshots.at(-1).captureState.rendererCounters;
    await mutate('setTransmissionResolutionScale',[0.5]);
    await capture('transmission-driver-half','canvas','driver');
    assert.deepEqual(report.screenshots.at(-1).captureState.rendererCounters,driverCounters,'Changing target resolution changes no draw or triangle count');
    await verify('transmission-visual-controls');
    report.allVisualChecksCompletedAt=new Date().toISOString();await save();
    for(const scale of report.comparisonProtocol.scales) {
      await mutate('setTransmissionResolutionScale',[scale]);
      // Wait for the new setting's demand frame; sampleFrames drains its GPU work
      // before starting the unchanged 24 continuous submissions.
      await page.waitForFunction(()=>{const state=window.__R35_QA__.getCaptureState();return state.transmission.observedSceneRevision===state.sceneRevision && state.renderedSceneRevision===state.sceneRevision;},{},{timeout:30000});
      const setup=await page.evaluate(()=>({state:window.__R35_QA__.getCaptureState(),model:window.__R35_QA__.model}));
      checkTransmission(setup.state,scale);assert.equal(setup.model,'runtime');
      await sample(`transmission-driver-${scale===1?'full':'half'}`,false,{scale,counters:driverCounters,setup});
    }
  } else {
  if(focus==='full') {
  // Preserve first actual pixels before longer input/measurement sequences.
  await capture('initial-runtime');
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
  await inspectLoadedGeometry();
  await mutate('setGlass',[false]);
  const opaqueHash=await capture('exterior-source-windows');
  await mutate('setGlass',[true]);
  assert.notEqual(await capture('exterior-transparent-windows'),opaqueHash,'Transparent windows change rendered pixels at a fixed camera');
  await mutate('setGlass',[false]);
  assert.equal(await capture('exterior-source-windows-restored'),opaqueHash,'Window restoration returns baseline pixels');
  await mutate('setGlass',[true]);
  for(const view of ['driver','passenger','rear']) {
    const beforeButton=await page.evaluate(()=>window.__R35_QA__.getCaptureState().sceneRevision);
    await page.getByRole('button',{name:{driver:'Driver eye',passenger:'Passenger eye',rear:'Rear eye'}[view],exact:true}).click();
    const afterButton=await page.evaluate(()=>window.__R35_QA__.getCaptureState().sceneRevision);
    assert.ok(afterButton>beforeButton,`${view}: camera button invalidates`);report.dirtyChecks.push({method:`button-${view}`,before:beforeButton,after:afterButton});
    const before=await page.evaluate(()=>window.__R35_QA__.getCameraState());assert.equal(before.view,view);
    await capture(view);
    await mutate('selectView',[view]);
    if(plan==='desktop')for(const [label,yaw,pitch] of [['left',90,0],['right',-90,0],['behind',180,0],['up',0,60],['down',0,-60]]) {
      await mutate('look',[yaw,pitch]);await capture(`${view}-${label}`);
    }
    await mutate('selectView',[view]);
    const bounds=await page.locator('#viewport canvas').boundingBox();
    await page.mouse.move(bounds.x+bounds.width*.4,bounds.y+bounds.height*.4);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.7,bounds.y+bounds.height*.6,{steps:5});await page.mouse.up();
    await page.mouse.wheel(0,3000);await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
    const after=await page.evaluate(()=>window.__R35_QA__.getCameraState());
    assert.deepEqual(after.position,before.position,`${view}: camera cannot translate`);
    assert.notDeepEqual(after.direction,before.direction,`${view}: look input changes direction`);
    for(const [yaw,pitch] of [[999,999],[-999,-999]]) {
      const edge=await mutate('look',[yaw,pitch]);
      assert.deepEqual(edge.position,before.position);assert.ok(Math.abs(edge.pan.yaw)<=180 && Math.abs(edge.pan.pitch)<=70);
    }
    await verify(`${view}-camera-controls`);
  }
  await mutate('selectView',['exterior']);
  const initialAppearance=await page.evaluate(()=>window.__R35_QA__.getAppearance()),appearanceHashes={};
  const initialAppearanceHash=await capture('appearance-baseline');
  for(const [label,paint,lights] of [['paint-red','#b31625',false],['paint-red-lights-on','#b31625',true],['paint-blue-lights-on','#183f80',true],['appearance-restored',initialAppearance.paint,initialAppearance.lights]]) {
    const result=await mutate('setAppearance',[paint,lights]);
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
  await mutate('setAppearance',[initialAppearance.paint,true]);
  assert.notEqual(await capture('rear-exterior-lamps-on'),rearOff,'Rear lights alter pixels with paint fixed');
  await mutate('setAppearance',[initialAppearance.paint,false]);
  assert.equal(await capture('rear-exterior-lamps-restored'),rearOff,'Rear lamp restoration returns baseline pixels');await verify('rear-lamp-isolation');
  await mutate('selectView',['exterior']);await mutate('setCabinOnly',[true]);
  await capture('cabin-isolated');await verify('cabin-isolated');
  await page.evaluate(()=>window.__R35_QA__.loadModel('original'));await waitReady();await capture('cabin-separate-file');await verify('cabin-separate-file');
  await page.evaluate(()=>window.__R35_QA__.loadModel('runtime'));await waitReady();
  await mutate('setCabinOnly',[false]);await mutate('selectView',['driver']);
  for(let index=0;index<6;index++)await mutate('setGlass',[index%2===0]);
  await mutate('setGlass',[true]);await verify('repeated-window-toggles-and-reload');
  await page.evaluate(()=>Promise.all([window.__R35_QA__.loadModel('original'),window.__R35_QA__.loadModel('runtime')]));await waitReady();
  assert.equal(await page.evaluate(()=>window.__R35_QA__.model),'runtime');await verify('overlapping-load-latest-wins');
  await mutate('selectView',['driver']);
  await capture('page','viewport');
  } else {
    await inspectLoadedGeometry();
    await mutate('setGlass',[true]);await mutate('selectView',['rear']);
    await capture('rear');await verify('focused-rear');
    for(const [label,yaw,pitch] of [['left',90,0],['right',-90,0],['behind',180,0],['up',0,60]]) {
      await mutate('look',[yaw,pitch]);await capture(`rear-${label}`);
    }
    await page.evaluate(()=>window.__R35_QA__.selectExteriorRear());
    const rearPhysicalHash=await capture('rear-exterior-lamps-off');
    await mutate('setGlass',[false]);
    await capture('rear-exterior-source-windows','canvas','rear-exterior-lamps-off');
    await verify('focused-rear-source-windows');
    await mutate('setGlass',[true]);
    assert.equal(await capture('rear-exterior-windows-restored','canvas','rear-exterior-lamps-off'),rearPhysicalHash,'Focused rear window restoration returns exact pixels');
    await mutate('setCabinOnly',[true]);await mutate('selectView',['exterior']);
    await capture('cabin-isolated');await verify('focused-spatial-isolated');
  }
  report.spatialVisualChecksCompletedAt=new Date().toISOString();await save();
  // A matched control is loaded only after the complete spatial visual set.
  await mutate('setCabinOnly',[true]);await mutate('selectView',['exterior']);
  await page.evaluate(()=>window.__R35_QA__.loadModel('global'));await waitReady();
  await capture('global-control-cabin-isolated','canvas','cabin-isolated');await verify('global-control-isolated');
  await mutate('setCabinOnly',[false]);await mutate('selectView',['driver']);
  await capture('global-control-driver','canvas','driver');await verify('global-control-driver');
  report.allVisualChecksCompletedAt=new Date().toISOString();await save();
  report.comparisonProtocol={
    sameSource:true,geometrySourceSha256:'bf38f51d0386e80b2fbbba9b7acda936aba0f5fbaf0ec183f5a96b646933af7f',
    finishedSourceSha256:'f69ea1e852811e0c2ca022c43e689d2e864904d02c7199b999ab66c751335781',
    spatialSha256:'111457de471188208c934e982cbcb076b37417f302560cfbab4b8d88ed092be8',
    globalSha256:'f1e96e98d36d132d37b7419ea255205b1c9e0e2137ca6891311432a27b60fa9c',
    sameBrowserRendererAndJob:true,samplesPerCase:24,repeatsPerCase:1,counterbalanced:false,
    note:'Bounded same-source comparison, not a repeated benchmark or physical Android test. Spatial runs first; expensive global driver runs last. Existing 90s completion and 120s sample deadlines are unchanged.',
    cases:[{view:'exterior',case:'cabin-isolated',cabinOnly:true},{view:'driver',case:'driver-idle',cabinOnly:false}],
  };
  for(const config of report.comparisonProtocol.cases) for(const variant of ['spatial','global']) {
    const key=variant==='spatial'?'runtime':'global';
    // Use identical inexpensive warmup pose before each fresh variant load.
    await page.evaluate(()=>{const qa=window.__R35_QA__;qa.setCabinOnly(true);qa.setGlass(true);qa.selectView('exterior');});
    await page.evaluate(key=>window.__R35_QA__.loadModel(key),key);await waitReady();
    const setup=await page.evaluate(({config,key})=>{
      const qa=window.__R35_QA__;qa.setCabinOnly(config.cabinOnly);qa.setGlass(true);qa.selectView(config.view);
      return {state:qa.getCaptureState(),assets:qa.loadMeasurements,model:qa.model,renderer:qa.renderer};
    },{config,key});
    assert.equal(setup.model,key);assert.deepEqual(setup.renderer,report.renderer);
    const expectedHash=variant==='spatial'?report.comparisonProtocol.spatialSha256:report.comparisonProtocol.globalSha256;
    assert.equal(setup.assets.find(asset=>asset.file!=='ciasny-r35.glb').sha256,expectedHash);
    const reference=baseline.plans[plan].screenshots.find(item=>item.file===`${plan}-${config.cabinOnly?'cabin-isolated':'driver'}.png`);
    const pose=Object.fromEntries(Object.entries(setup.state.camera).filter(([field])=>Object.hasOwn(reference.camera,field)));
    assert.deepEqual(pose,reference.camera);for(const field of ['canvas','appearance','glass','cabinOnly'])assert.deepEqual(setup.state[field],reference[field]);
    await sample(`${variant}-${config.case}`,false,{variant,case:config.case,assetSha256:expectedHash,setup});
  }
  }
  report.finalStats=await page.evaluate(()=>window.__R35_QA__.stats);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.requestFailures,[]);
  report.status=focus==='sealed-visual'?'sealed-visual-checks-passed-review-pending':focus==='full'?'functional-checks-passed-visual-review-pending':focus==='transmission-desktop'?'transmission-diagnostic-passed-visual-review-pending':'focused-checks-passed-visual-review-pending';
} catch(error) {
  report.status='failed';report.failure=error.stack;process.exitCode=1;
  if(report.performanceIncomplete)report.failureScreenshotError='Skipped because incomplete performance work may still be pending; earlier visual evidence is retained';
  else if(report.captureOperationUncertain || error.name==='CaptureStageTimeout' || error.name==='TimeoutError')report.failureScreenshotError='Skipped because a timed-out browser operation may still be pending';
  else if(capture && !report.captureCleanupFailed)await capture('failure','viewport').catch(error=>{report.failureScreenshotError=error.stack;});
  else if(report.captureCleanupFailed)report.failureScreenshotError='Skipped because renderer resume could not be verified';
  else if(page)await page.screenshot({path:`${output}/${plan}-failure.png`,timeout:30000}).catch(error=>{report.failureScreenshotError=error.stack;});
} finally {
  report.finishedAt=new Date().toISOString();await save();
  if(browser)await withCaptureDeadline(browser.close(),'browser cleanup',30000).catch(error=>{report.browserCleanupError=error.stack;});
  server.kill('SIGTERM');await save();
}
console.log(JSON.stringify({status:report.status,report:`${output}/${plan}-report.json`}));
