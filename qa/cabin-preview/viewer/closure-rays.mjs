import { DoubleSide, Mesh, Raycaster, Vector3 } from 'three';

export const WINDOW_ALLOWLIST=Object.freeze([
  'Door Window_Glass_0','Doors.002_Glass_0','Rear Window_Glass_0','Back Body.001_Glass_0',
]);
const finite3=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const defaultPrefixes=['DRIVER','PASSENGER','C0','C1','C2','DASH','CTRL','REAR_'];
function authoredName(mesh) {
  // A prepared clone can retain the tag on a parent; never infer windows by material.
  for(let node=mesh;node;node=node.parent) {
    if(typeof node.userData?.immutable_source_name==='string') return node.userData.immutable_source_name;
  }
  for(let node=mesh;node;node=node.parent) {
    if(typeof node.userData?.name==='string'&&node.userData.name) return node.userData.name;
  }
  return mesh.name||'';
}
function validateFixtures(data) {
  if(data?.schemaVersion!==1||data.coordinateSystem!=='three-y-up-native-metres') throw new Error('Unsupported ray fixture schema or coordinate system');
  if(!Number.isFinite(data.maxDistanceMetres)||data.maxDistanceMetres<=0) throw new Error('Ray maximum distance must be positive and finite');
  if(JSON.stringify(data.windowAllowlist)!==JSON.stringify(WINDOW_ALLOWLIST)) throw new Error('The exact four-window allowlist must be preserved');
  const seen=new Set();
  for(const [key,countKey] of [['closureRays','closures'],['glazingRays','glazing'],['informationalRays','informational']]) {
    const rows=data[key];
    if(!Array.isArray(rows)||rows.length!==data.expectedCounts?.[countKey]) throw new Error(`Fixture count mismatch: ${key}`);
    for(const row of rows) {
      if(!Array.isArray(row)||row.length!==7||!row.every(Number.isFinite)) throw new Error(`Malformed ${key} row`);
      const [captureIndex,x,y,sourceIndex,...direction]=row;
      if(!Number.isInteger(captureIndex)||!Number.isInteger(sourceIndex)||!data.captures?.[captureIndex]||typeof data.sources?.[sourceIndex]!=='string') throw new Error('Invalid fixture capture/source reference');
      if(!finite3(data.captures[captureIndex].origin)) throw new Error('Invalid fixture origin');
      if(Math.hypot(...direction)<1e-12) throw new Error('Zero ray direction');
      const id=`${captureIndex}:${x}:${y}`;
      if(seen.has(id)) throw new Error(`Duplicate ray fixture: ${id}`);seen.add(id);
      if(key==='glazingRays'&&!WINDOW_ALLOWLIST.includes(data.sources[sourceIndex])) throw new Error('Non-window in glazing fixtures');
    }
  }
}
function batchParts(mesh) {
  if(!mesh.userData?.runtime_batch) {
    if(authoredName(mesh).startsWith('C10_BATCH')) throw new Error(`Missing batch metadata: ${mesh.name}`);
    return null;
  }
  if(mesh.userData.runtimeDetachedParts?.length) throw new Error(`Cannot resolve detached batch index ranges: ${mesh.name}`);
  const parts=mesh.userData.parts,indexCount=mesh.geometry.index?.count??mesh.geometry.attributes.position.count;
  if(!Array.isArray(parts)||!parts.length) throw new Error(`Missing source-part metadata: ${mesh.name}`);
  const sorted=[...parts].sort((a,b)=>a.firstIndex-b.firstIndex);let end=0;
  for(const part of sorted) {
    if(!Number.isInteger(part.firstIndex)||!Number.isInteger(part.indexCount)||part.firstIndex!==end||part.indexCount<=0||part.firstIndex%3||part.indexCount%3||typeof part.sourceName!=='string') throw new Error(`Invalid batch source-part range: ${mesh.name}`);
    end+=part.indexCount;
  }
  if(end!==indexCount) throw new Error(`Incomplete batch source-part coverage: ${mesh.name}`);
  return sorted;
}
function rayOnlyMesh(mesh,doubleSided) {
  if(!doubleSided) return mesh;
  // Inherit exact loaded geometry, morph state, and live matrixWorld. No scene
  // clone, attachment, detachment, material clone, or material setter is used.
  const view=Object.create(mesh);
  const materialView=material=>Object.assign(Object.create(material),{side:DoubleSide});
  view.material=Array.isArray(mesh.material)?mesh.material.map(materialView):materialView(mesh.material);
  return view;
}
function hitSummary(hit,record,roles) {
  const part=record.parts?.find(p=>hit.faceIndex*3>=p.firstIndex&&hit.faceIndex*3<p.firstIndex+p.indexCount);
  if(record.parts&&!part) throw new Error(`Unmapped batch triangle: ${record.mesh.name}/${hit.faceIndex}`);
  const sourceName=part?.sourceName??record.name;
  const isWindow=WINDOW_ALLOWLIST.includes(sourceName);
  const isCabin=!isWindow&&((roles.cabinMeshNames??[]).includes(sourceName)||(roles.cabinMeshPrefixes??defaultPrefixes).some(prefix=>prefix&&sourceName.startsWith(prefix)));
  return {sourceName,meshName:record.mesh.name,role:isWindow?'window':isCabin?(sourceName.startsWith('C2')?'closure':'cabin'):'exterior-or-unknown',
    distance:hit.distance,point:hit.point.toArray(),faceIndex:hit.faceIndex,
    ...(part?{batchName:record.name,sourcePrimitive:part.sourcePrimitive,firstIndex:part.firstIndex,indexCount:part.indexCount}:{})};
}

/**
 * Geometric closure QA on the exact currently loaded Group.
 * Default fixtureToWorld=root.matrixWorld maps native fixture metres into world.
 * Pass an explicit Matrix4 if normalization lives below root; it must describe
 * the shared native frame of BOTH exterior and cabin. Do not apply normalization
 * merely because exteriorDerivedAppTransform was recorded by the inspector.
 * Geometry mode reproduces Blender BVH double sides. Runtime-side mode respects
 * other material sides and overrides only the exact four source windows.
 */
export function inspectClosureRays(root,data,{
  roles={},fixtureToWorld,sidePolicy='double-sided-geometry',
}={}) {
  if(!root?.isObject3D) throw new TypeError('Expected the loaded model Group');
  validateFixtures(data);
  if(!['double-sided-geometry','runtime-with-double-sided-windows'].includes(sidePolicy)) throw new Error('Unsupported ray side policy');
  root.updateWorldMatrix(true,true);
  const matrix=fixtureToWorld??root.matrixWorld;
  if(!matrix?.isMatrix4||!matrix.elements.every(Number.isFinite)||Math.abs(matrix.determinant())<1e-15||matrix.elements[3]!==0||matrix.elements[7]!==0||matrix.elements[11]!==0||matrix.elements[15]!==1) throw new Error('fixtureToWorld must be a finite invertible affine Matrix4');
  const records=[];
  // Include all mesh geometry, even unknown/non-window meshes. No selection by
  // expected hit, role, material alpha, or visibility can hide an obstruction.
  root.traverse(mesh=>{
    if(!mesh.isMesh) return;
    if(mesh.isInstancedMesh||mesh.isSkinnedMesh) throw new Error(`Unsupported non-static mesh: ${mesh.name}`);
    if(!mesh.geometry?.attributes.position||!mesh.material) throw new Error(`Missing triangle geometry/material: ${mesh.name}`);
    const name=authoredName(mesh),parts=batchParts(mesh);
    records.push({mesh,name,parts,rayMesh:rayOnlyMesh(mesh,sidePolicy==='double-sided-geometry'||WINDOW_ALLOWLIST.includes(name))});
  });
  const raycaster=new Raycaster(),origin=new Vector3(),direction=new Vector3(),end=new Vector3();
  const cast=row=>{
    const [captureIndex,x,y,sourceIndex,dx,dy,dz]=row,capture=data.captures[captureIndex];
    direction.set(dx,dy,dz).normalize();origin.fromArray(capture.origin);
    end.copy(origin).addScaledVector(direction,data.maxDistanceMetres).applyMatrix4(matrix);
    origin.applyMatrix4(matrix);direction.copy(end).sub(origin);
    const far=direction.length();direction.normalize();raycaster.set(origin,direction);raycaster.near=0;raycaster.far=far;
    let first=null,firstRecord=null;
    for(const record of records) {
      const hits=[];
      Mesh.prototype.raycast.call(record.rayMesh,raycaster,hits);
      for(const hit of hits) if(!first||hit.distance<first.distance){first=hit;firstRecord=record;}
    }
    const hit=first?hitSummary(first,firstRecord,roles):null;
    return {file:capture.file,pixel:[x,y],baselineSource:data.sources[sourceIndex],
      ray:{origin:origin.toArray(),direction:direction.toArray(),far},hit};
  };
  const fixtures=data.closureRays.map(row=>{const result=cast(row);return {...result,closed:['closure','cabin'].includes(result.hit?.role)};});
  const apertures=data.glazingRays.map(row=>{const result=cast(row);return {...result,preserved:result.hit?.role==='window'&&result.hit.sourceName===result.baselineSource};});
  const informational=data.informationalRays.map(row=>{const result=cast(row);return {...result,closed:['closure','cabin'].includes(result.hit?.role),gatesPass:false};});
  const closed=fixtures.filter(r=>r.closed).length,aperturePreserved=apertures.filter(r=>r.preserved).length;
  return {schemaVersion:1,scope:'Loaded Three.js geometry ray checks; not WebGL visual acceptance or complete cabin occlusion proof',
    sidePolicy,fixtureToWorld:matrix.toArray(),maxDistanceMetres:data.maxDistanceMetres,meshCount:records.length,
    closed,total:fixtures.length,aperturePreserved,apertureSamples:apertures.length,
    passed:closed===fixtures.length&&aperturePreserved===apertures.length,
    fixtures,apertures,informational,missingOriginalSelections:data.missingOriginalSelections??[],
    failedFixtures:fixtures.filter(r=>!r.closed),obstructedApertures:apertures.filter(r=>!r.preserved)};
}
