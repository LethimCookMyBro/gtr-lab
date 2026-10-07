import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import * as windowMaterials from '../viewer/window-materials.js';
import { classifyMesh, createRenderSchedule, WINDOW_ALLOWLIST, validateContract, withinBounds, hasCurrentRender, cabinPose } from '../viewer/runtime-core.js';

const roles = JSON.parse(await readFile(new URL('../roles.json', import.meta.url), 'utf8'));
const contract = JSON.parse(await readFile(new URL('../camera-contract.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../viewer/app.js', import.meta.url), 'utf8');
const sourceSignature = material => JSON.stringify(material.toJSON());

test('thin glass is one non-transmissive Standard artistic trial using the scene environment', () => {
  assert.equal(typeof windowMaterials.createThinWindowMaterial, 'function', 'Thin factory must exist');
  const original = new THREE.MeshPhysicalMaterial({ color: 0x113344, transmission: 0.7, metalness: 0.8, opacity: 0.9 });
  original.name = 'Shared_Window_Glass';
  original.map = new THREE.Texture();
  original.envMap = new THREE.Texture();
  const before = sourceSignature(original);
  const thin = windowMaterials.createThinWindowMaterial(original);
  assert.notEqual(thin, original);
  assert.equal(thin.type, 'MeshStandardMaterial');
  assert.equal(thin.isMeshPhysicalMaterial, undefined);
  assert.equal(thin.transmission ?? 0, 0);
  assert.equal(thin.transparent, true);
  assert.equal(thin.depthTest, true);
  assert.equal(thin.depthWrite, false);
  assert.equal(thin.side, THREE.DoubleSide);
  assert.equal(thin.forceSinglePass, true);
  assert.equal(thin.metalness, 0);
  assert.equal(thin.roughness, 0.05);
  assert.equal(thin.opacity, 0.16);
  assert.equal(thin.color.getHex(), 0xf5f5f5);
  assert.equal(thin.envMap, null, 'Use the existing scene environment');
  assert.equal(thin.envMapIntensity, 1);
  assert.equal(thin.map, null);
  assert.equal(thin.alphaMap, null);
  assert.equal(thin.emissive.getHex(), 0);
  assert.equal(sourceSignature(original), before);
});

function fixture() {
  const exterior = new THREE.Group();
  const source = new THREE.MeshStandardMaterial({ color: 0x344556, metalness: 0.3 });
  source.name = 'Window_Glass';
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const names = [...WINDOW_ALLOWLIST, 'Hood.001_Glass_0', 'Headlights_Glass_0', 'TailightsGlass_Glass_0'];
  names.forEach(name => { const mesh = new THREE.Mesh(geometry, source); mesh.name = name; exterior.add(mesh); });
  const cabin = new THREE.Group();
  const interior = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  interior.name = 'DASH_fixture'; cabin.add(interior);
  return { exterior, cabin, source, geometry };
}

async function appHarness(inputs = fixture()) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { checked: false, textContent: '', removeAttribute() {}, replaceChildren() {} });
    return elements.get(id);
  };
  const context = vm.createContext({ THREE, ...windowMaterials, classifyMesh, createRenderSchedule, validateContract, withinBounds, hasCurrentRender, cabinPose,
    URLSearchParams, location: { search: '' }, performance, console,
    document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null, createElement: () => ({}) },
    window: { addEventListener() {} },
    prepareVehicle: root => ({ scene: root, bindings: [], scale: 1, position: [0, 0, 0] }),
    applyVehicleAppearance() {},
  });
  // Execute the real viewer logic with only browser startup and imports removed.
  // No browser, network, server, render loop or WebGL context is started.
  vm.runInContext(appSource.replace(/^import .*;\n/gm, '').replace(/start\(\)\.catch\(fail\);\s*$/, '') + `
    globalThis.harness = {
      async load(inputs, nextRoles, nextContract, model = 'sealed') {
        roles=nextRoles; contract=nextContract; appearanceContract={materialRoles:{},disabledEmissive:[]};
        scene ||= new THREE.Scene(); camera ||= new THREE.PerspectiveCamera();
        orbit ||= {target:new THREE.Vector3(),update(){},enablePan:false};
        renderer ||= {transmissionResolutionScale:1,getContext:()=>({drawingBufferWidth:100,drawingBufferHeight:100}),
          getPixelRatio:()=>1,domElement:{width:100,height:100,getBoundingClientRect:()=>({x:0,y:0,width:100,height:100})},info:{render:{calls:0,triangles:0}}};
        loadCheckedAsset=async path=>({gltf:{scene:path.endsWith('ciasny-r35.glb')?inputs.exterior:inputs.cabin},measurement:{file:path.split('/').pop()}});
        return loadModel(model);
      },
      setWindowMode:typeof setWindowMode==='function'?setWindowMode:null,setGlass,
      diagnostics:typeof getWindowPolicyDiagnostics==='function'?getWindowPolicyDiagnostics:null,
      capture:getCaptureState, records:()=>records, scene:()=>scene,
      pause:value=>{capturePaused=value;}, sample:value=>{activeSample=value;},
      revision:()=>renderSchedule.state().sceneRevision,
      probe:installTransmissionProbe, transmission:getTransmissionDiagnostics, resetProbe:resetTransmissionObservations,
      dispose:()=>disposeModel(modelRoot,records),
    };`, context, { filename: 'viewer-app-node-test.js' });
  const harness = context.harness;
  await harness.load(inputs, roles, contract);
  return { harness, inputs };
}

test('viewer defaults to physical, switches only four confirmed windows, and restores exact shared source refs', async () => {
  const { harness, inputs } = await appHarness();
  assert.equal(typeof harness.setWindowMode, 'function', 'QA mode setter must exist');
  const sourceBefore = sourceSignature(inputs.source);
  const records = harness.records();
  const windows = records.filter(record => record.isWindow);
  assert.equal(windows.length, 4);
  const physical = windows.map(record => record.mesh.material);
  assert.ok(physical.every(material => material.type === 'MeshPhysicalMaterial' && material.transmission === 1));
  assert.equal(harness.diagnostics().windowMode, 'physical');
  assert.equal(harness.diagnostics().activeTransmissionMaterials.length, 4);
  assert.equal(harness.setWindowMode('thin'), 'thin');
  for (const record of windows) assert.equal(record.mesh.material.type, 'MeshStandardMaterial');
  for (const record of records.filter(record => !record.isWindow)) assert.equal(record.mesh.material, record.baseline, record.name);
  assert.equal(harness.diagnostics().windowCount, 4);
  assert.equal(harness.diagnostics().activeTransmissionMaterials.length, 0);
  assert.equal(harness.diagnostics().nonWindowMaterialReferencesUntouched, true);
  assert.equal(harness.diagnostics().sourceMaterialsUnchanged, true);
  assert.equal(sourceSignature(inputs.source), sourceBefore);
  harness.setGlass(false);
  for (const record of windows) assert.equal(record.mesh.material, record.baseline);
  assert.ok(harness.diagnostics().windows.every(window => window.sourceRestored));
  harness.setWindowMode('physical');
  assert.ok(windows.every(record => record.mesh.material === record.baseline), 'Mode cannot bypass disabled glass');
  harness.setGlass(true);
  windows.forEach((record, index) => assert.equal(record.mesh.material, physical[index]));
  harness.setWindowMode('thin');
  harness.setGlass(false);
  harness.setGlass(true);
  assert.ok(windows.every(record => record.mesh.material.type === 'MeshStandardMaterial'));
});

test('window mode rejects invalid and capture/sample mutations without changing references or revisions', async () => {
  const { harness } = await appHarness();
  assert.equal(typeof harness.setWindowMode, 'function');
  const before = harness.revision();
  const active = harness.records().map(record => record.mesh.material);
  assert.throws(() => harness.setWindowMode('fast'), /Window mode/);
  for (const blocked of ['capture', 'sample']) {
    if (blocked === 'capture') harness.pause(true); else harness.sample({ phase: 'preparing' });
    assert.throws(() => harness.setWindowMode('thin'), /capture or timing/);
    harness.records().forEach((record, index) => assert.equal(record.mesh.material, active[index]));
    assert.equal(harness.revision(), before);
    harness.pause(false); harness.sample(null);
  }
  harness.setWindowMode('physical');
  assert.equal(harness.revision(), before + 1, 'Same mode still invalidates');
  harness.setWindowMode('thin');
  assert.equal(harness.revision(), before + 2);
  harness.setGlass(false);
  const disabledRevision = harness.revision();
  harness.setWindowMode('thin');
  assert.equal(harness.revision(), disabledRevision + 1, 'Disabled glass mode setter still invalidates');
});

test('capture diagnostics include the chosen mode, exact window parameters, and full-scene transmission materials', async () => {
  const { harness } = await appHarness();
  assert.equal(typeof harness.diagnostics, 'function');
  harness.setWindowMode('thin');
  const environment = new THREE.Texture();
  harness.scene().environment = environment;
  const capture = harness.capture();
  assert.equal(capture.windowMode, 'thin');
  assert.equal(capture.windowPolicy.windowMode, 'thin');
  assert.equal(capture.windowPolicy.model, 'sealed');
  assert.equal(capture.windowPolicy.glass, true);
  assert.equal(capture.windowPolicy.activePolicy, 'thin');
  assert.equal(capture.windowPolicy.windowCount, 4);
  assert.equal(capture.windowPolicy.environmentAvailable, true);
  assert.deepEqual(Array.from(capture.windowPolicy.windows, window => window.name).sort(), [...WINDOW_ALLOWLIST].sort());
  for (const window of capture.windowPolicy.windows) {
    for (const [key, value] of Object.entries({ activeType: 'MeshStandardMaterial', transmission: 0, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false, depthTest: true, side: THREE.DoubleSide, forceSinglePass: true })) assert.equal(window[key], value, `${window.name}.${key}`);
    assert.equal(window.sourceRestored, false);
    assert.equal(window.usesSceneEnvironment, true);
    assert.equal(window.color, 'f5f5f5');
  }
  const outsider = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ transmission: 0.4 }));
  outsider.name = 'Outside_model_root'; outsider.material.name = 'External_transmission';
  harness.scene().add(outsider);
  let diagnostics = harness.diagnostics();
  assert.equal(diagnostics.activeTransmissionMaterialCount, 1);
  assert.equal(diagnostics.activeTransmissionMaterials[0].name, 'External_transmission');
  assert.deepEqual(Array.from(diagnostics.activeTransmissionMaterialNames), ['External_transmission']);
  harness.setGlass(false);
  diagnostics = harness.diagnostics();
  assert.equal(diagnostics.activePolicy, 'source');
  assert.ok(diagnostics.windows.every(window => window.sourceRestored));
  assert.equal(diagnostics.sourceMaterialReferencesRestored, true);
  assert.equal(harness.scene().environment, environment);
});

test('reload disposes both window override modes and each owned shared resource exactly once', async () => {
  const { harness, inputs } = await appHarness();
  assert.equal(typeof harness.setWindowMode, 'function');
  const physical = harness.records().filter(record => record.isWindow).map(record => record.mesh.material);
  harness.setWindowMode('thin');
  const thin = harness.records().filter(record => record.isWindow).map(record => record.mesh.material);
  const owned = new Set([inputs.source, inputs.geometry, ...physical, ...thin, ...harness.records().map(record => record.baseline)]);
  const disposed = new Map();
  const environment = new THREE.Texture();
  harness.scene().environment = environment;
  environment.addEventListener('dispose', () => assert.fail('Reload must not dispose the scene environment'));
  owned.forEach(resource => resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1)));
  harness.setGlass(false);
  await harness.load(fixture(), roles, contract);
  owned.forEach(resource => assert.equal(disposed.get(resource), 1, resource.name || resource.type));
  assert.equal(harness.diagnostics().windowMode, 'thin', 'Selected mode survives reload');
  assert.ok(harness.diagnostics().windows.every(window => window.sourceRestored), 'Disabled state survives reload');
  harness.setGlass(true);
  assert.ok(harness.records().filter(record => record.isWindow).every(record => record.mesh.material.type === 'MeshStandardMaterial'));
  assert.equal(harness.scene().environment, environment);
});

test('window array slots preserve the exact original array and never change a shared cowl array', async () => {
  const inputs = fixture();
  const shared = [inputs.source, new THREE.MeshStandardMaterial({ color: 0x445566 })];
  inputs.exterior.children[0].material = shared;
  inputs.exterior.children.find(mesh => mesh.name === 'Hood.001_Glass_0').material = shared;
  const { harness } = await appHarness(inputs);
  const window = harness.records().find(record => record.name === WINDOW_ALLOWLIST[0]);
  const cowl = harness.records().find(record => record.name === 'Hood.001_Glass_0');
  harness.setWindowMode('thin');
  assert.notEqual(window.mesh.material, shared);
  assert.equal(window.mesh.material.length, 2);
  assert.ok(window.mesh.material.every(material => material.type === 'MeshStandardMaterial' && material.opacity === 0.16));
  assert.equal(cowl.mesh.material, shared);
  harness.setGlass(false);
  assert.equal(window.mesh.material, shared);
  assert.equal(cowl.mesh.material, shared);
});

test('pinned r180 classifies thin materials as transparent and gates the extra scene pass on transmission', async () => {
  assert.equal(THREE.REVISION, '180');
  const source = new THREE.MeshStandardMaterial();
  const thin = windowMaterials.createThinWindowMaterial(source);
  const physical = windowMaterials.createWindowMaterial(source);
  const list = new WebGLRenderList();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), thin);
  list.init(); list.push(mesh, mesh.geometry, thin, 0, 0, null);
  assert.equal(list.transmissive.length, 0);
  assert.equal(list.transparent.length, 1);
  list.init(); list.push(mesh, mesh.geometry, physical, 0, 0, null);
  assert.equal(list.transmissive.length, 1);
  const rendererSource = await readFile(new URL('../../../node_modules/three/src/renderers/WebGLRenderer.js', import.meta.url), 'utf8');
  assert.match(rendererSource, /if \( transmissiveObjects\.length > 0 \) renderTransmissionPass\( opaqueObjects, transmissiveObjects, scene, camera \);/);
});

test('transmission probe preserves callbacks and thin zero-target observations never infer a target', async () => {
  const { harness } = await appHarness();
  assert.equal(typeof harness.setWindowMode, 'function');
  const record = harness.records().find(record => record.isWindow);
  let called = 0;
  const previous = function(...args) { called++; assert.equal(this, record.mesh); assert.equal(args.length, 2); return 'previous-result'; };
  record.mesh.onBeforeRender = previous;
  harness.probe(record.mesh, record.name);
  harness.setWindowMode('thin'); harness.resetProbe(123);
  assert.equal(record.mesh.onBeforeRender({ getRenderTarget: () => null }, 'camera'), 'previous-result');
  assert.equal(called, 1);
  assert.equal(harness.transmission().observedTargets.length, 0);
  assert.equal(harness.transmission().observedSceneRevision, 123);
  const target = { width: 50, height: 25, samples: 4 };
  record.mesh.onBeforeRender({ getRenderTarget: () => target }, 'camera');
  assert.equal(harness.transmission().observedTargets.length, 1, 'Unexpected targets remain observable in thin mode');
});
