import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Matrix4, FrontSide } from 'three';
import { inspectClosureRays, WINDOW_ALLOWLIST } from '../viewer/closure-rays.mjs';
const roles={cabinMeshPrefixes:['C0','C1','C2'],windowMeshes:[{name:'Door Window_Glass_0',confirmed:true}]};
function data(source='Doors_CarPaint_0') { return {
  schemaVersion:1,coordinateSystem:'three-y-up-native-metres',maxDistanceMetres:5,
  windowAllowlist:[...WINDOW_ALLOWLIST],sources:[source],captures:[{file:'test.png',origin:[0,0,0]}],
  closureRays:[[0,1,1,0,0,0,-1]],glazingRays:[],informationalRays:[],
  expectedCounts:{closures:1,glazing:0,informational:0},
}; }
function plane(name,z,{back=false,batch=false}={}){
  const mesh=new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial({side:FrontSide}));
  mesh.name=name;mesh.userData.name=name;mesh.position.z=z;if(back)mesh.rotation.y=Math.PI;
  if(batch){mesh.userData.runtime_batch=true;mesh.userData.parts=[{sourceName:'C22 quarter surround',firstIndex:0,indexCount:6,sourcePrimitive:0}];}
  return mesh;
}
test('missing or exterior hit never passes by negative filtering',()=>{
  const root=new Group();assert.equal(inspectClosureRays(root,data(),{roles}).closed,0);
  const mesh=plane('Doors_CarPaint_0',-2);mesh.userData.immutable_source_name='Doors_CarPaint_0';root.add(mesh);
  const result=inspectClosureRays(root,data(),{roles});assert.equal(result.closed,0);assert.equal(result.fixtures[0].hit.sourceName,'Doors_CarPaint_0');
});
test('exact live batch hit resolves source triangle without detaching or changing materials',()=>{
  const root=new Group(),mesh=plane('C10_BATCH_000_black',-1,{batch:true});root.add(mesh);
  const before=JSON.stringify(mesh.material.toJSON()),children=[...root.children],index=mesh.geometry.index;
  const result=inspectClosureRays(root,data(),{roles});
  assert.equal(result.closed,1);assert.equal(result.fixtures[0].hit.sourceName,'C22 quarter surround');assert.equal(result.fixtures[0].hit.role,'closure');
  assert.equal(result.fixtures[0].hit.meshName,'C10_BATCH_000_black');assert.equal(JSON.stringify(mesh.material.toJSON()),before);
  assert.deepEqual(root.children,children);assert.equal(mesh.geometry.index,index);assert.equal(mesh.userData.runtimeDetached,undefined);
});
test('four windows are ray-tested DoubleSide without editing shared originals; cowl is excluded',()=>{
  const root=new Group(),mesh=plane('sanitized_window',-1,{back:true});mesh.userData.immutable_source_name=WINDOW_ALLOWLIST[0];root.add(mesh);
  const fixtures=data(WINDOW_ALLOWLIST[0]);fixtures.glazingRays=fixtures.closureRays;fixtures.closureRays=[];fixtures.expectedCounts={closures:0,glazing:1,informational:0};
  const result=inspectClosureRays(root,fixtures,{roles,sidePolicy:'runtime-with-double-sided-windows'});
  assert.equal(result.aperturePreserved,1);assert.equal(mesh.material.side,FrontSide);
  mesh.userData.immutable_source_name='Hood.001_Glass_0';assert.equal(inspectClosureRays(root,fixtures,{roles,sidePolicy:'runtime-with-double-sided-windows'}).aperturePreserved,0);
});
test('closer unknown geometry blocks glazing and is not filtered away',()=>{
  const root=new Group();root.add(plane(WINDOW_ALLOWLIST[0],-2),plane('unknown obstruction',-1));
  const fixtures=data(WINDOW_ALLOWLIST[0]);fixtures.glazingRays=fixtures.closureRays;fixtures.closureRays=[];fixtures.expectedCounts={closures:0,glazing:1,informational:0};
  const result=inspectClosureRays(root,fixtures,{roles});assert.equal(result.aperturePreserved,0);assert.equal(result.apertures[0].hit.sourceName,'unknown obstruction');
});
test('finite segment transforms with the actual Group including nonuniform scale',()=>{
  const parent=new Group(),root=new Group();parent.add(root);root.add(plane('C21 closure',-4));parent.position.set(4,2,9);parent.scale.set(2,3,4);parent.rotation.y=.7;
  const result=inspectClosureRays(root,data(),{roles});assert.equal(result.closed,1);assert.ok(Math.abs(result.fixtures[0].ray.far-20)<1e-8);assert.ok(Math.abs(result.fixtures[0].hit.distance-16)<1e-8);
  root.children[0].position.z=-6;assert.equal(inspectClosureRays(root,data(),{roles}).closed,0);
});
test('explicit native-to-world transform supports child-prepared normalization',()=>{
  const root=new Group(),mesh=plane('C21 closure',-1);root.add(mesh);mesh.position.x=10;
  assert.equal(inspectClosureRays(root,data(),{roles}).closed,0);
  assert.equal(inspectClosureRays(root,data(),{roles,fixtureToWorld:new Matrix4().makeTranslation(10,0,0)}).closed,1);
});
test('geometry mode matches Blender double sides while runtime mode exposes backface differences',()=>{
  const root=new Group();root.add(plane('C21 closure',-1,{back:true}));
  assert.equal(inspectClosureRays(root,data(),{roles}).closed,1);assert.equal(inspectClosureRays(root,data(),{roles,sidePolicy:'runtime-with-double-sided-windows'}).closed,0);
});
test('rejects missing rays, unsafe distances, malformed directions and ambiguous batch metadata',()=>{
  const root=new Group(),fixtures=data();fixtures.closureRays=[];assert.throws(()=>inspectClosureRays(root,fixtures,{roles}),/count/);
  const infinite=data();infinite.maxDistanceMetres=Infinity;assert.throws(()=>inspectClosureRays(root,infinite,{roles}),/finite/);
  const zero=data();zero.closureRays[0].splice(4,3,0,0,0);assert.throws(()=>inspectClosureRays(root,zero,{roles}),/direction/);
  const mesh=plane('C10_BATCH_broken',-1,{batch:true});mesh.userData.runtimeDetachedParts=[0];root.add(mesh);assert.throws(()=>inspectClosureRays(root,data(),{roles}),/detached/);
});

test('prepared clone keeps exact ancestor window identity ahead of child material or mesh names',()=>{
  const root=new Group(),source=new Group();source.userData.immutable_source_name=WINDOW_ALLOWLIST[2];
  const mesh=plane('Hood001_Glass_0',-1,{back:true});source.add(mesh);root.add(source.clone(true));
  const fixtures=data(WINDOW_ALLOWLIST[2]);fixtures.glazingRays=fixtures.closureRays;fixtures.closureRays=[];fixtures.expectedCounts={closures:0,glazing:1,informational:0};
  assert.equal(inspectClosureRays(root,fixtures,{roles,sidePolicy:'runtime-with-double-sided-windows'}).aperturePreserved,1);
});
test('batch node cannot be mistaken for a source cabin component after metadata loss',()=>{
  const root=new Group();root.add(plane('C10_BATCH_missing_metadata',-1));
  assert.throws(()=>inspectClosureRays(root,data(),{roles}),/batch/);
});
