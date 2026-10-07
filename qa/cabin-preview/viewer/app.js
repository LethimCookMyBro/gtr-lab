import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { classifyMesh, cabinPose, validateContract, withinBounds, hasCurrentRender, createRenderSchedule } from './runtime-core.js';
import { createWindowMaterial } from './window-materials.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { prepareVehicle, applyVehicleAppearance } from './app-source/materialAdapter.js';
import { summarizeSamples, createFrameSample } from './metrics.js';
import { inspectEyeClearance } from './camera-clearance.js';
import { inspectClosureRays } from './closure-rays.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MODELS = Object.freeze({ runtime: ['../ciasny-r35.glb', '../r35-original-cabin-lod0.glb'], original: ['../r35-original-cabin-lod0.glb'], global: ['../ciasny-r35.glb', '../r35-contained-global-control.glb'], sealed: ['../ciasny-r35.glb', '../r35-sealed-spatial.glb'] });
const expectedScreenshots = ['exterior-baseline.png','exterior-windows.png','driver.png','passenger.png','rear.png','cabin-isolated.png','original-cabin.png'];
const qa = window.__R35_QA__ = {
  ready: false, error: null, version: 1, threeRevision: THREE.REVISION,
  checks: {}, screenshots: {status:'not-run', expected:expectedScreenshots, outputDirectory:'qa/artifacts'},
  performance: {status:'not-run', note:'Browser/GPU performance is unverified. Live timing is not a benchmark.'},
  warnings: [], model: null, loadGeneration: 0, stats: {},
};
let renderer, scene, camera, orbit, modelRoot, roles, contract, appearanceContract, inputManifest, loadGeneration=0;
let appearanceBindings=[], appearance={paint:'#b8bec5',lights:false}, activeSample=null;
let capturePaused=false, captureFrameSerial=0, continuousFrameSerial=0;
const transmissionTargets=new Map();
let observedTransmissionSceneRevision=null;
const renderSchedule=createRenderSchedule();
let records=[], helperGroup, currentView='exterior', pan={yaw:0,pitch:0};
let glassEnabled=params.get('glass')!=='0', cabinOnly=params.get('cabin')==='1';
let lastFrame=0, frameTimes=[], lastStatsUpdate=0;
let loadStart=0, loadMilliseconds=0, renderFrameCount=0, modelGeneration=0;
const materials = value => Array.isArray(value) ? value : [value];
const materialSignature = material => JSON.stringify(Object.fromEntries(Object.entries(material)
  .filter(([key,value]) => !['version','userData','_listeners'].includes(key) &&
    (value===null || ['string','number','boolean'].includes(typeof value) || value?.isColor || value?.isTexture))
  .map(([key,value])=>[key,value?.isTexture ? value.uuid : value?.isColor ? value.toArray() : value])));

function invalidateScene(minimumFrames=1) {
  renderSchedule.invalidate(minimumFrames);
  if(!activeSample){lastFrame=0;frameTimes=[];}
}

function setTransmissionResolutionScale(value) {
  if(value!==1 && value!==0.5) throw new RangeError('Transmission resolution scale must be 1 or 0.5');
  if(capturePaused || activeSample) throw new Error('Cannot change transmission resolution scale during capture or timing');
  renderer.transmissionResolutionScale=value;
  invalidateScene();
  return renderer.transmissionResolutionScale;
}

function resetTransmissionObservations(sceneRevision=renderSchedule.state().sceneRevision) {
  transmissionTargets.clear();
  observedTransmissionSceneRevision=sceneRevision;
}

function installTransmissionProbe(mesh, windowName) {
  const previous=mesh.onBeforeRender;
  mesh.onBeforeRender=function(...args) {
    const result=typeof previous==='function' ? previous.apply(this,args) : undefined;
    // r180 renders DoubleSide transmission backfaces into its intermediate target
    // unless WEBGL_multisampled_render_to_texture is present. Missing observations
    // remain empty; no target size is inferred from the requested scale.
    const target=args[0].getRenderTarget();
    if(target!==null) {
      let observation=transmissionTargets.get(target);
      if(!observation) {
        observation={width:target.width,height:target.height,samples:target.samples,windowNames:new Set()};
        transmissionTargets.set(target,observation);
      }
      observation.windowNames.add(windowName);
    }
    return result;
  };
}

function getTransmissionDiagnostics() {
  const gl=renderer.getContext();
  return {scale:renderer.transmissionResolutionScale,
    drawingBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},
    observedTargets:[...transmissionTargets.values()].map(target=>({width:target.width,height:target.height,samples:target.samples,windowNames:[...target.windowNames]})),
    observedSceneRevision:observedTransmissionSceneRevision};
}

function fail(error) {
  if(activeSample){activeSample.reject(error);activeSample=null;}
  qa.ready=false; qa.error=error?.message || String(error);
  $('error').textContent=`Unable to complete runtime inspection.\n${qa.error}\n\nServe the runtime package over local HTTP. Check that both GLBs, roles.json and camera-contract.json are beside the viewer folder.`;
  $('error').hidden=false; $('status').textContent='Inspection blocked';
  $('progress').hidden=true; $('controls').disabled=true;
  console.error(error);
}
window.addEventListener('error', event=>fail(event.error || event.message));
window.addEventListener('unhandledrejection', event=>fail(event.reason));

async function jsonFile(url) {
  const response=await fetch(url, {cache:'no-store'});
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function disposeModel(root, oldRecords=[]) {
  if (!root) return;
  const geometry=new Set(), materialSet=new Set(), textures=new Set();
  root.traverse(object=>{
    if (object.geometry) geometry.add(object.geometry);
    if (object.material) materials(object.material).forEach(m=>materialSet.add(m));
  });
  oldRecords.forEach(record=>[...materials(record.baseline),...materials(record.override || [])].forEach(m=>materialSet.add(m)));
  materialSet.forEach(material=>Object.values(material).forEach(value=>{if(value?.isTexture) textures.add(value);}));
  geometry.forEach(item=>item.dispose()); materialSet.forEach(item=>item.dispose()); textures.forEach(item=>item.dispose());
}

function applyVisibility() {
  records.forEach(record=>{ record.mesh.visible=record.baselineVisible && (!cabinOnly || record.isCabin); });
  $('cabin').checked=cabinOnly;
  invalidateScene();
  updateChecks();
}
function setCabinOnly(value) { cabinOnly=Boolean(value); applyVisibility(); return cabinOnly; }
function setGlass(value) {
  glassEnabled=Boolean(value);
  records.filter(record=>record.isWindow).forEach(record=>{record.mesh.material=glassEnabled ? record.override : record.baseline;});
  $('glass').checked=glassEnabled;
  invalidateScene();
  updateChecks();
  return glassEnabled;
}

function setAppearance(paint, lights) {
  const protectedRecords=records.filter(record=>record.isCabin || record.isWindow);
  const before=protectedRecords.map(record=>materials(record.baseline).map(materialSignature));
  const bindingsBefore=appearanceBindings.map(binding=>({role:binding.role,signature:materialSignature(binding.material)}));
  applyVehicleAppearance(appearanceBindings,paint,lights);
  appearance={paint,lights};
  invalidateScene();
  const protectedUnchanged=protectedRecords.every((record,index)=>materials(record.baseline).every((material,slot)=>materialSignature(material)===before[index][slot]));
  if(!protectedUnchanged) throw new Error('Paint or light control changed cabin/window source materials');
  records.forEach(record=>{record.signatures=materials(record.baseline).map(materialSignature);});
  updateChecks();
  return {appearance:{...appearance},protectedUnchanged,
    bindings:appearanceBindings.map((binding,index)=>({role:binding.role,name:binding.material.name,changed:materialSignature(binding.material)!==bindingsBefore[index].signature})),
    cabinBindings:appearanceBindings.filter(binding=>records.some(record=>record.isCabin && materials(record.baseline).includes(binding.material))).length};
}

async function loadCheckedAsset(path) {
  const start=performance.now(),response=await fetch(path);
  if(!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const buffer=await response.arrayBuffer(),fetchedAt=performance.now();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),value=>value.toString(16).padStart(2,'0')).join('');
  const expected=inputManifest.assets.find(asset=>path.endsWith('/'+asset.file));
  if(!expected || buffer.byteLength!==expected.bytes || digest!==expected.sha256) throw new Error(`Unmatched asset bytes: ${path}`);
  const manager=new THREE.LoadingManager(),failed=[];
  manager.onError=url=>failed.push(url);
  const parseStarted=performance.now();
  const gltf=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer,'');
  const textures=await gltf.parser.getDependencies('texture');
  if(failed.length || textures.some(texture=>!texture)) {disposeModel(gltf.scene);throw new Error(`Texture decoding incomplete for ${path}`);}
  return {gltf,measurement:{file:expected.file,sha256:digest,bytes:buffer.byteLength,fetchMs:fetchedAt-start,integrityCheckMs:parseStarted-fetchedAt,parseAndDecodeMs:performance.now()-parseStarted,
    decodedTextures:textures.length,decodedTextureExtents:textures.map(texture=>({name:texture.name,width:texture.image?.width || null,height:texture.image?.height || null})),
    textureMemoryNote:'Dimensions and resource counts only. GPU allocation bytes and residency are not measured.'}};
}

function updateChecks() {
  if (!modelRoot) return;
  const windowRecords=records.filter(record=>record.isWindow);
  const confirmedNames=(roles.windowMeshes || []).filter(role=>role.confirmed).map(role=>role.name);
  const expectedNames=MODELS[qa.model]?.includes('../ciasny-r35.glb') ? confirmedNames : [];
  const exterior=contract.presets.exterior;
  const exteriorDistance=camera.position.distanceTo(orbit.target);
  qa.checks={
    cameraContractValid: validateContract(contract).length===0,
    expectedWindowsPresent: expectedNames.every(name=>windowRecords.some(record=>record.name===name)),
    onlyConfirmedWindowOverrides: windowRecords.every(record=>confirmedNames.includes(record.name)),
    baselineMaterialsUnchanged: records.every(record=>materials(record.baseline).every((m,index)=>materialSignature(m)===record.signatures[index])),
    nonWindowMaterialReferencesUntouched: records.filter(record=>!record.isWindow).every(record=>record.mesh.material===record.baseline),
    baselineRestoredWhenDisabled: glassEnabled || windowRecords.every(record=>record.mesh.material===record.baseline),
    cabinEyeInsideBounds: currentView==='exterior' || withinBounds(camera.position.toArray(),contract.presets[currentView].bounds),
    cabinEyeTranslationLocked: currentView==='exterior' || camera.position.toArray().every((value,axis)=>Math.abs(value-contract.presets[currentView].position[axis])<1e-9),
    noCabinOrbitControls: currentView==='exterior' || orbit.enabled===false,
    exteriorOrbitTargetLocked: currentView!=='exterior' || orbit.target.toArray().every((value,axis)=>Math.abs(value-exterior.target[axis])<1e-9),
    exteriorDistanceConstrained: currentView!=='exterior' || (exteriorDistance>=exterior.minDistance-1e-9 && exteriorDistance<=exterior.maxDistance+1e-9),
    exteriorPanningDisabled: orbit.enablePan===false,
    cabinIsolationCorrect: !cabinOnly || records.every(record=>!record.mesh.visible || record.isCabin),
    cabinMeshCountPositive: records.some(record=>record.isCabin),
    renderedAtLeastOneFrame: hasCurrentRender({ready:qa.ready,loadGeneration,stats:{modelGeneration,renderedFrames:renderFrameCount}}),
  };
  return qa.checks;
}

function countScene() {
  const uniqueMaterials=new Set(), sourceMaterials=new Set(), textures=new Set();
  let triangles=0, visibleTriangles=0;
  records.forEach(record=>{
    const geometry=record.mesh.geometry;
    const count=(geometry.index?.count ?? geometry.attributes.position?.count ?? 0)/3;
    triangles+=count;
    if(record.mesh.visible) visibleTriangles+=count;
    materials(record.mesh.material).forEach(m=>uniqueMaterials.add(m));
    materials(record.baseline).forEach(m=>sourceMaterials.add(m));
  });
  uniqueMaterials.forEach(material=>Object.values(material).forEach(value=>{if(value?.isTexture) textures.add(value);}));
  return {meshes:records.length,visibleMeshes:records.filter(record=>record.mesh.visible).length,
    triangles,visibleTriangles,materials:uniqueMaterials.size,sourceMaterials:sourceMaterials.size,
    textures:textures.size,windowMeshes:records.filter(record=>record.isWindow).length,
    cabinMeshes:records.filter(record=>record.isCabin).length};
}

function updateStats(now) {
  const counts=countScene();
  const sorted=[...frameTimes].sort((a,b)=>a-b);
  qa.stats={...counts,drawCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,
    gpuGeometries:renderer.info.memory.geometries,gpuTextures:renderer.info.memory.textures,
    frameMsMedian:sorted[Math.floor(sorted.length/2)] || null,frameMsP95:sorted[Math.floor(sorted.length*.95)] || null,
    loadMilliseconds,viewport:{width:renderer.domElement.width,height:renderer.domElement.height},
    devicePixelRatio:renderer.getPixelRatio(),renderedFrames:renderFrameCount,modelGeneration};
  const fields=[['Meshes',counts.meshes],['Visible meshes',counts.visibleMeshes],['Triangles',counts.triangles],
    ['Visible triangles',counts.visibleTriangles],['Active materials',counts.materials],['Source materials',counts.sourceMaterials],
    ['Active texture refs',counts.textures],['GPU textures',qa.stats.gpuTextures],['Draw calls / frame',qa.stats.drawCalls],
    ['Confirmed windows',counts.windowMeshes],['Original cabin meshes',counts.cabinMeshes],
    ['Model load',`${(loadMilliseconds/1000).toFixed(2)} s`],['Frame interval / median',qa.stats.frameMsMedian ? `${qa.stats.frameMsMedian.toFixed(1)} ms` : 'Pending']];
  $('stats').replaceChildren(...fields.flatMap(([label,value])=>{
    const dt=document.createElement('dt'),dd=document.createElement('dd'); dt.textContent=label;
    dd.textContent=typeof value==='number' ? value.toLocaleString() : value; return [dt,dd];
  }));
  updateChecks(); lastStatsUpdate=now;
}

function applyCabinLook(yaw, pitch) {
  if(currentView==='exterior') return;
  const pose=cabinPose(contract.presets[currentView],yaw,pitch);
  pan={yaw:pose.yaw,pitch:pose.pitch};
  camera.position.fromArray(pose.position);
  camera.lookAt(new THREE.Vector3().fromArray(pose.position).add(new THREE.Vector3().fromArray(pose.direction)));
  invalidateScene();
  updateChecks();
}
function selectView(name) {
  if(!contract.presets[name]) throw new Error(`Unknown camera preset: ${name}`);
  currentView=name; pan={yaw:0,pitch:0};
  const preset=contract.presets[name];
  // Damping is disabled so previous orbit deltas cannot leak into cabin views.
  orbit.enabled=name==='exterior';
  camera.position.fromArray(preset.position);
  camera.fov=preset.fov; camera.near=preset.near || 0.03; camera.far=preset.far || 100;
  camera.updateProjectionMatrix();
  if(name==='exterior') {
    orbit.minDistance=preset.minDistance || 0.2; orbit.maxDistance=preset.maxDistance || 16;
    orbit.target.fromArray(preset.target); orbit.update();
  } else applyCabinLook(0,0);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===name)));
  $('view-label').textContent=name==='exterior' ? 'EXTERIOR ORBIT' : `${name.toUpperCase()} / FIXED EYE`;
  $('instructions').textContent=name==='exterior'
    ? 'Drag to orbit · Scroll to dolly · Orbit target is fixed'
    : 'Drag or arrow keys to look around · Eye position is fixed · R resets view';
  invalidateScene();
  updateChecks();
  return getCameraState();
}
function getCameraState() {
  return {view:currentView,position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),
    fov:camera.fov,near:camera.near,pan:{...pan},orbitEnabled:orbit.enabled,
    orbitTarget:orbit.target.toArray(),orbitDistance:camera.position.distanceTo(orbit.target),orbitMinDistance:orbit.minDistance,orbitMaxDistance:orbit.maxDistance};
}

function getCaptureState() {
  const {x,y,width,height}=renderer.domElement.getBoundingClientRect();
  return {ready:qa.ready,loadGeneration,modelGeneration,model:qa.model,capturePaused,captureFrameSerial,continuousFrameSerial,...renderSchedule.state(),
    renderMode:capturePaused?'capture':activeSample?activeSample.phase:'demand',
    renderedFrames:renderFrameCount,camera:getCameraState(),viewLabel:$('view-label').textContent,selectedView:document.querySelector('[data-view][aria-pressed="true"]')?.dataset.view,glass:glassEnabled,cabinOnly,appearance:{...appearance},
    canvas:{width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio()},bounds:{x,y,width,height},transmission:getTransmissionDiagnostics(),
    rendererCounters:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}};
}

function beginCapture() {
  if(activeSample) throw new Error('Cannot pause rendering during a timing sample');
  if(capturePaused) throw new Error('A capture is already active');
  if(!qa.ready || qa.error || modelGeneration!==loadGeneration || renderFrameCount<1) throw new Error('Capture requires a current rendered model');
  capturePaused=true;
  return getCaptureState();
}

async function renderCaptureFrame() {
  if(!capturePaused || activeSample) throw new Error('Capture frame requires paused continuous submissions and no timing sample');
  const started=performance.now();
  const revision=renderSchedule.state().sceneRevision;
  renderer.info.reset();resetTransmissionObservations(revision);renderer.render(scene,camera);renderFrameCount++;
  renderSchedule.markSubmitted(revision);
  const submitted=performance.now();
  const gpuCompletionWaitWallMs=await waitForGpuCompletion('capture');
  captureFrameSerial++;
  return {...getCaptureState(),renderSubmissionCpuMs:submitted-started,gpuCompletionWaitWallMs};
}

async function waitForGpuCompletion(label) {
  const submitted=performance.now();
  // Completion fence. Timer polling does not depend on presentation RAF.
  // This wall time includes queued work and polling; it is not a GPU timer measurement.
  const gl=renderer.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  if(!fence)throw new Error(`Unable to create GPU ${label} completion fence`);
  gl.flush();
  try {
    await new Promise((resolve,reject)=>{
      const poll=()=>{
        if(gl.isContextLost()){reject(new Error(`WebGL context lost during ${label}`));return;}
        const status=gl.clientWaitSync(fence,0,0);
        if(status===gl.ALREADY_SIGNALED || status===gl.CONDITION_SATISFIED){resolve();return;}
        if(status===gl.WAIT_FAILED){reject(new Error(`GPU ${label} completion fence failed`));return;}
        if(performance.now()-submitted>=90000){reject(new Error(`GPU ${label} completion fence timed out after 90 seconds`));return;}
        setTimeout(poll,25);
      };
      poll();
    });
  } finally {gl.deleteSync(fence);}
  return performance.now()-submitted;
}

function resumeAfterCapture() {
  capturePaused=false;
  // Do not count capture/readback wall time as an idle/panning frame interval.
  lastFrame=0;frameTimes=[];
  invalidateScene();
  return getCaptureState();
}
function buildHelpers() {
  helperGroup=new THREE.Group(); helperGroup.name='QA_camera_eye_helpers'; helperGroup.visible=false;
  const colors={driver:0xffa06a,passenger:0x71cce7,rear:0xc7a1ff};
  for(const name of ['driver','passenger','rear']) {
    const preset=contract.presets[name];
    const marker=new THREE.Mesh(new THREE.SphereGeometry(0.023,12,8),new THREE.MeshBasicMaterial({color:colors[name],depthTest:false}));
    marker.position.fromArray(preset.position); marker.renderOrder=10; helperGroup.add(marker);
    const direction=new THREE.Vector3().fromArray(preset.target).sub(marker.position).normalize();
    helperGroup.add(new THREE.ArrowHelper(direction,marker.position,0.25,colors[name],0.04,0.022));
  }
  scene.add(helperGroup);
}

async function loadModel(key) {
  if(!Object.hasOwn(MODELS,key)) throw new Error(`Unknown model option: ${key}`);
  const generation=++loadGeneration;
  qa.ready=false; qa.error=null; qa.model=key; qa.loadGeneration=generation;
  qa.stats={renderedFrames:0,modelGeneration:null};
  $('error').hidden=true; $('controls').disabled=true; $('progress').hidden=false; $('progress').removeAttribute('value');
  $('status').textContent='Loading private GLB…'; loadStart=performance.now();
  const thisLoadStart=loadStart;
  let gltf,assetResults;
  try {
    const settled=await Promise.allSettled(MODELS[key].map(loadCheckedAsset));
    const failed=settled.find(result=>result.status==='rejected');
    if(failed) {settled.filter(result=>result.status==='fulfilled').forEach(result=>disposeModel(result.value.gltf.scene));throw failed.reason;}
    assetResults=settled.map(result=>result.value);
    const combined=new THREE.Group();let bindings=[];
    for(const result of assetResults) {
      if(result.measurement.file==='ciasny-r35.glb') {
        const prepared=prepareVehicle(result.gltf.scene,appearanceContract.materialRoles,appearanceContract.disabledEmissive);
        bindings=prepared.bindings;applyVehicleAppearance(bindings,appearance.paint,appearance.lights);combined.add(prepared.scene);
        // Shared native metre frame here; record the app's parent transform for later integration.
        combined.userData.exteriorDerivedAppTransform={scale:prepared.scale,position:prepared.position};
      } else combined.add(result.gltf.scene);
    }
    gltf={scene:combined,bindings};
  } catch(error) {
    if(generation!==loadGeneration) return {stale:true};
    throw error;
  }
  if(generation!==loadGeneration) {disposeModel(gltf.scene);return;}
  if(modelRoot) {scene.remove(modelRoot);disposeModel(modelRoot,records);}
  resetTransmissionObservations(null);
  modelRoot=gltf.scene; records=[]; modelGeneration=generation;
  appearanceBindings=gltf.bindings;
  qa.loadMeasurements=assetResults.map(result=>result.measurement);
  qa.exteriorDerivedAppTransform=modelRoot.userData.exteriorDerivedAppTransform || null;
  renderFrameCount=0; frameTimes=[]; lastFrame=0;
  captureFrameSerial=0;continuousFrameSerial=0;capturePaused=false;
  qa.stats={renderedFrames:0,modelGeneration};
  modelRoot.traverse(object=>{
    if(!object.isMesh) return;
    const classification=classifyMesh(object,roles);
    if(classification.isWindow) installTransmissionProbe(object,classification.name);
    const baseline=object.material;
    const override=classification.isWindow
      ? (Array.isArray(baseline) ? baseline.map(createWindowMaterial) : createWindowMaterial(baseline)) : null;
    records.push({mesh:object,...classification,baseline,override,baselineVisible:object.visible,
      signatures:materials(baseline).map(materialSignature)});
  });
  scene.add(modelRoot); modelRoot.updateMatrixWorld(true);
  loadMilliseconds=performance.now()-thisLoadStart;
  qa.firstFrameSubmittedMs=null;
  $('model').value=key; setGlass(glassEnabled); applyVisibility(); selectView(currentView);
  const foundWindows=records.filter(record=>record.isWindow);
  $('roles').replaceChildren(...foundWindows.map(record=>{
    const p=document.createElement('p');p.textContent=`${record.name} · ${record.role}`;return p;
  }));
  if(!foundWindows.length) $('roles').textContent='No exterior windows in this asset. Source materials are unchanged.';
  qa.warnings=[];
  const unchecked=(roles.windowMeshes || []).filter(role=>role.confirmed!==true);
  if(unchecked.length) qa.warnings.push(`${unchecked.length} unconfirmed window roles were excluded.`);
  if(!records.some(record=>record.isCabin)) qa.warnings.push('No cabin meshes matched roles.json; cabin isolation would be empty.');
  if(contract.notes) qa.warnings.push(...(Array.isArray(contract.notes)?contract.notes:[contract.notes]));
  if(contract.limitations) qa.warnings.push(contract.limitations);
  $('status').textContent='Loaded · Runtime visual review pending'; $('progress').hidden=true; $('controls').disabled=false;
  qa.ready=true;invalidateScene(4);updateChecks();
  return {model:key,meshes:records.length,checks:qa.checks};
}

function bindControls() {
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.view)));
  $('reset').addEventListener('click',()=>selectView(currentView));
  $('glass').addEventListener('change',event=>setGlass(event.target.checked));
  $('cabin').addEventListener('change',event=>setCabinOnly(event.target.checked));
  $('helpers').addEventListener('change',event=>{helperGroup.visible=event.target.checked;invalidateScene();});
  $('model').addEventListener('change',event=>loadModel(event.target.value).catch(fail));
  let drag=null;
  renderer.domElement.addEventListener('pointerdown',event=>{
    $('viewport').focus();
    if(currentView==='exterior' || !qa.ready || event.button!==0 || drag) return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(!drag || drag.id!==event.pointerId || currentView==='exterior') return;
    const sensitivity=0.12;
    applyCabinLook(pan.yaw-(event.clientX-drag.x)*sensitivity,pan.pitch+(event.clientY-drag.y)*sensitivity);
    drag.x=event.clientX; drag.y=event.clientY;
  });
  const release=event=>{if(drag?.id===event.pointerId) drag=null;};
  renderer.domElement.addEventListener('pointerup',release);
  renderer.domElement.addEventListener('pointercancel',release);
  renderer.domElement.addEventListener('lostpointercapture',release);
  renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
  renderer.domElement.addEventListener('wheel',event=>{if(currentView!=='exterior') event.preventDefault();},{passive:false});
  $('viewport').addEventListener('keydown',event=>{
    if(!qa.ready) return;
    if(event.key.toLowerCase()==='r') {selectView(currentView);event.preventDefault();}
    if(currentView==='exterior') return;
    const delta={ArrowLeft:[3,0],ArrowRight:[-3,0],ArrowUp:[0,3],ArrowDown:[0,-3]}[event.key];
    if(delta){applyCabinLook(pan.yaw+delta[0],pan.pitch+delta[1]);event.preventDefault();}
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  if(!renderer || document.hidden || qa.error || capturePaused) return;
  if(activeSample && activeSample.phase!=='sampling') return;
  if(currentView==='exterior') orbit.update();
  if(!activeSample && !renderSchedule.needsRender())return;
  const previousFrame=lastFrame;
  if(lastFrame) {frameTimes.push(now-lastFrame);if(frameTimes.length>180)frameTimes.shift();}
  lastFrame=now;
  const cpuStart=performance.now();
  const revision=renderSchedule.state().sceneRevision;
  renderer.info.reset(); resetTransmissionObservations(revision); renderer.render(scene,camera);
  renderSchedule.markSubmitted(revision);
  const sampledFrame=createFrameSample(now,previousFrame,performance.now()-cpuStart,renderer.info.render.calls,renderer.info.render.triangles);
  if(activeSample && qa.ready) {
    activeSample.samples.push(sampledFrame);
    if(activeSample.moving && currentView!=='exterior' && activeSample.samples.length<activeSample.count) applyCabinLook(Math.sin(activeSample.samples.length*.18)*30,Math.cos(activeSample.samples.length*.18)*10);
    if(activeSample.samples.length>=activeSample.count) {
      const sample=activeSample;sample.phase='draining';sample.submissionEnd=performance.now();
      waitForGpuCompletion('timing sample').then(drainMs=>finishSample(sample,{status:'completed',gpuDrainWallMs:drainMs}),error=>finishSample(sample,{status:'failed',error:error.message}));
    }
  }
  if(modelRoot && qa.ready && modelGeneration===loadGeneration) {renderFrameCount++;continuousFrameSerial++;}
  if(modelRoot && qa.ready && qa.firstFrameSubmittedMs===null) qa.firstFrameSubmittedMs=performance.now()-loadStart;
  if(modelRoot && (now-lastStatsUpdate>500 || (!activeSample && !renderSchedule.needsRender()))) updateStats(now);
}

function timingSnapshot(sample=activeSample) {
  if(!sample)return null;
  return {...summarizeSamples(sample.samples),phase:sample.phase,view:currentView,glass:glassEnabled,cabinOnly,model:qa.model,appearance:{...appearance},
    transmission:getTransmissionDiagnostics(),
    viewport:{width:renderer.domElement.width,height:renderer.domElement.height},priorGpuDrainWallMs:sample.priorGpuDrainWallMs??null,
    submissionWallMs:sample.submissionEnd&&sample.started?sample.submissionEnd-sample.started:null,
    measurementMode:`${sample.count} explicit continuous render submissions; prior work and completion drained separately. Demand-idle time and capture waits are excluded. No physical Android claim.`};
}

function finishSample(sample,gpuCompletion) {
  if(activeSample!==sample)return;
  const result={...timingSnapshot(sample),gpuCompletion,totalSampleWallMs:performance.now()-sample.started};
  updateStats(performance.now());
  activeSample=null;lastFrame=0;frameTimes=[];sample.resolve(result);
}

function sampleFrames(count=24,moving=false) {
  return new Promise((resolve,reject)=>{
    if(activeSample){reject(new Error('A frame sample is already running'));return;}
    if(capturePaused){reject(new Error('Timing cannot run during a screenshot pause'));return;}
    if(!Number.isInteger(count)||count<1||count>240){reject(new Error('Frame count must be 1 through 240'));return;}
    if(!qa.ready||qa.error||modelGeneration!==loadGeneration){reject(new Error('Timing requires the current ready model'));return;}
    const sample={count,moving,samples:[],resolve,reject,phase:'preparing'};activeSample=sample;
    waitForGpuCompletion('timing preflight').then(priorGpuDrainWallMs=>{
      if(activeSample!==sample)return;
      sample.priorGpuDrainWallMs=priorGpuDrainWallMs;sample.started=performance.now();sample.phase='sampling';lastFrame=0;frameTimes=[];
    },error=>{if(activeSample===sample)activeSample=null;reject(error);});
  });
}

async function start() {
  [roles,contract,appearanceContract,inputManifest]=await Promise.all([jsonFile('../roles.json'),jsonFile('../camera-contract.json'),jsonFile('../app-appearance.json'),jsonFile('../input-manifest.json')]);
  qa.inputManifest=inputManifest;
  if(roles.schemaVersion!==1) throw new Error('Unsupported roles.json schemaVersion');
  const errors=validateContract(contract);
  if(errors.length) throw new Error(errors.join('\n'));
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
  renderer.info.autoReset=false;
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  qa.renderer={version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER),unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
    webgl2:renderer.capabilities.isWebGL2,multiDraw:Boolean(gl.getExtension('WEBGL_multi_draw')),timerQuery:Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
    multisampledRenderToTexture:Boolean(gl.getExtension('WEBGL_multisampled_render_to_texture')),gpuTimingMeasured:false};
  $('viewport').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('WebGL context lost. Reload to retry.'));});
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x202a35);
  camera=new THREE.PerspectiveCamera(45,1,0.03,100);
  orbit=new OrbitControls(camera,renderer.domElement);
  orbit.enableDamping=false; orbit.enablePan=false; orbit.minDistance=0.2; orbit.maxDistance=16;
  orbit.addEventListener('change',()=>invalidateScene());
  orbit.maxPolarAngle=Math.PI; orbit.minPolarAngle=0;
  const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
  const env=pmrem.fromScene(room,0.04); scene.environment=env.texture;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xddefff,0x475969,1.5));
  const key=new THREE.DirectionalLight(0xffffff,2.7);key.position.set(4,7,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0xd5e7ff,1.3);fill.position.set(-4,3,-4);scene.add(fill);
  buildHelpers(); bindControls();
  const resize=()=>{const width=$('viewport').clientWidth,height=$('viewport').clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();invalidateScene();};
  new ResizeObserver(resize).observe($('viewport'));resize();
  Object.assign(qa,{
    selectView,setGlass,setCabinOnly,loadModel,getCameraState,setAppearance,getCaptureState,beginCapture,renderCaptureFrame,resumeAfterCapture,
    setTransmissionResolutionScale,getTransmissionDiagnostics,
    getAppearance:()=>({...appearance}),
    selectExteriorRear:()=>{
      selectView('exterior');
      const offset=camera.position.clone().sub(orbit.target).applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
      camera.position.copy(orbit.target).add(offset);orbit.update();return getCameraState();
    },
    inspectEyeClearance:()=>inspectEyeClearance(modelRoot,contract.presets,camera.aspect),
    inspectClosureRays:fixtures=>({geometry:inspectClosureRays(modelRoot,fixtures,{roles}),runtimeSides:inspectClosureRays(modelRoot,fixtures,{roles,sidePolicy:'runtime-with-double-sided-windows'})}),
    sampleFrames,getTimingState:()=>timingSnapshot(),
    isRenderReady:minimumFrames=>hasCurrentRender({ready:qa.ready,loadGeneration,stats:{modelGeneration,renderedFrames:renderFrameCount}},minimumFrames),
    look:(yaw,pitch)=>{applyCabinLook(yaw,pitch);return getCameraState();},
    getChecks:updateChecks,
    getWindowAssignments:()=>records.filter(record=>record.isWindow).map(record=>({name:record.name,role:record.role,
      baseline:materials(record.baseline).map(m=>({uuid:m.uuid,name:m.name})),active:materials(record.mesh.material).map(m=>({uuid:m.uuid,name:m.name,transmission:m.transmission || 0}))})),
    snapshot:()=>{renderer.info.reset();resetTransmissionObservations();renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},
  });
  if(Object.hasOwn(contract.presets,params.get('view'))) currentView=params.get('view');
  requestAnimationFrame(animate);
  await loadModel(params.get('model')==='sealed'?'sealed':params.get('model')==='original'?'original':'runtime');
}
start().catch(fail);
