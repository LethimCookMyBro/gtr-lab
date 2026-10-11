import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { prepareVehicle } from '../src/components/three/materialAdapter';

const roles = { paint: [], headlights: [], taillights: [] };
function asset(name, nativeCabin) {
  const source = new Group();
  // Native glTFs contain nested groups. A parent-only renderOrder would be
  // reset by these groups in WebGLRenderer.projectObject.
  const nested = new Group();
  source.add(nested);
  for (let i = 0; i < 2; i++) {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.name = `${name}-${i}`;
    nested.add(mesh);
  }
  return prepareVehicle(source, roles, [], nativeCabin);
}
function renderList(assets) {
  const list = new WebGLRenderList();
  list.init();
  function project(object, groupOrder = 0) {
    if (object.isGroup) groupOrder = object.renderOrder;
    if (object.isMesh) list.push(object, object.geometry, object.material, groupOrder, 0.5, null);
    for (const child of object.children) project(child, groupOrder);
  }
  for (const item of assets) project(item.scene);
  list.sort();
  return list;
}

it.each(['proxy', 'full'])(
  'keeps opaque exterior before %s regardless of async material-allocation order', cabinName => {
    for (const cabinFirst of [false, true]) {
      const allocated = cabinFirst
        ? [asset(cabinName, true), asset('exterior', false)]
        : [asset('exterior', false), asset(cabinName, true)];
      const exterior = allocated.find(item => item.scene.children[0].children[0].name.startsWith('exterior'));
      const cabin = allocated.find(item => item !== exterior);
      try {
        // Verify this fixture really changes material-ID ordering, rather than
        // accidentally testing only the same allocation sequence twice.
        expect(cabin.scene.children[0].children[0].material.id < exterior.scene.children[0].children[0].material.id).toBe(cabinFirst);
        for (const insertionOrder of [[exterior, cabin], [cabin, exterior]]) {
          const list = renderList(insertionOrder);
          expect(list.opaque.map(item => item.object.name)).toEqual(['exterior-0', 'exterior-1', `${cabinName}-0`, `${cabinName}-1`]);
          expect(list.transparent).toHaveLength(0);
          expect(list.transmissive).toHaveLength(0);
          for (const item of list.opaque) {
            expect(item.material.depthTest).toBe(true);
            expect(item.material.depthWrite).toBe(true);
            expect(item.object.castShadow).toBe(item.object.name.startsWith('exterior'));
            expect(item.object.receiveShadow).toBe(item.object.name.startsWith('exterior'));
          }
        }
      } finally { allocated.forEach(item => item.dispose()); }
    }
  },
);

it('keeps thin exterior glass in the later transparent list without changing its depth policy', () => {
  const cabin = asset('proxy', true), exterior = asset('exterior', false);
  const glass = exterior.scene.children[0].children[1];
  glass.material.transparent = true;
  glass.material.opacity = 0.16;
  glass.material.depthWrite = false;
  const list = renderList([cabin, exterior]);
  expect(list.opaque.map(item => item.object.name)).toEqual(['exterior-0', 'proxy-0', 'proxy-1']);
  expect(list.transparent.map(item => item.object)).toEqual([glass]);
  expect(glass.material.depthTest).toBe(true);
  expect(glass.material.depthWrite).toBe(false);
  expect(glass.renderOrder).toBe(0);
  cabin.dispose(); exterior.dispose();
});
