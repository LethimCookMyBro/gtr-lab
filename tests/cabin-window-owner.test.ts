import { expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import {
  CABIN_WINDOW_NAMES,
  createCabinWindowOwner,
} from "../src/components/three/cabinPreview";

it("keeps one set of thin materials while switching readiness, then restores and disposes once", () => {
  const root = new Group();
  const meshes = CABIN_WINDOW_NAMES.map((name) => {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.userData.name = name;
    root.add(mesh);
    return mesh;
  });
  const originals = meshes.map((mesh) => mesh.material);
  const owner = createCabinWindowOwner(root);
  expect(meshes.map((mesh) => mesh.material)).toEqual(originals);
  expect(owner.setTransparent(false)).toBe(false);
  expect(owner.setTransparent(true)).toBe(true);
  const thin = meshes.map((mesh) => mesh.material);
  const disposals = thin.map((material) => vi.spyOn(material, "dispose"));
  expect(owner.setTransparent(true)).toBe(false);
  expect(owner.setTransparent(false)).toBe(true);
  expect(meshes.map((mesh) => mesh.material)).toEqual(originals);
  owner.setTransparent(true);
  meshes.forEach((mesh, index) => expect(mesh.material).toBe(thin[index]));
  disposals.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  owner.dispose();
  owner.dispose();
  expect(owner.setTransparent(true)).toBe(false);
  expect(meshes.map((mesh) => mesh.material)).toEqual(originals);
  disposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});
