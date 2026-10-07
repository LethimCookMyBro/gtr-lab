import { expect, it, vi } from "vitest";
import {
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  DoubleSide,
} from "three";
import {
  overrideCabinWindows,
  cabinCameraView,
  CABIN_SEATS,
  CABIN_WINDOW_NAMES,
} from "../src/components/three/cabinPreview";
it("overrides only the four reviewed names and restores exact material/array identities once", () => {
  const root = new Group();
  const baseline = new MeshStandardMaterial({ name: "Window_Glass" });
  const meshes = [
    ...CABIN_WINDOW_NAMES,
    "Hood.001_Glass_0",
    "Headlights_Glass_0",
    "TailightsGlass_Glass_0",
    "paint",
  ].map((name, i) => {
    const mesh = new Mesh(
      new BoxGeometry(),
      i === 0 ? [baseline, baseline] : baseline,
    );
    mesh.userData.name = name;
    root.add(mesh);
    return mesh;
  });
  const originals = meshes.map((m) => m.material);
  const restore = overrideCabinWindows(root);
  const disposals = [];
  for (let i = 0; i < 4; i++) {
    const material = meshes[i].material;
    const m = Array.isArray(material) ? material[0] : material;
    expect(m).toBeInstanceOf(MeshStandardMaterial);
    expect(m).not.toBe(baseline);
    expect(m).toMatchObject({
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
      roughness: 0.05,
      metalness: 0,
      envMap: null,
    });
    expect("transmission" in m).toBe(false);
    disposals.push(vi.spyOn(m, "dispose"));
  }
  expect(meshes.slice(4).map((m) => m.material)).toEqual(originals.slice(4));
  restore();
  restore();
  meshes.forEach((m, i) => expect(m.material).toBe(originals[i]));
  disposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});
it("fails closed without modifying anything when a required window role is absent", () => {
  const root = new Group();
  const m = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  m.userData.name = CABIN_WINDOW_NAMES[0];
  root.add(m);
  const original = m.material;
  expect(() => overrideCabinWindows(root)).toThrow(/window/i);
  expect(m.material).toBe(original);
});
it.each(CABIN_SEATS)(
  "maps %s eye and target using the exterior transform, never cabin bounds",
  (seat) => {
    const view = cabinCameraView(seat, { scale: 2, position: [1, 2, 3] });
    const expected =
      seat === "driver"
        ? [1.84, 4.36, 2.53]
        : seat === "passenger"
          ? [0.16, 4.36, 2.53]
          : [1.8, 4.24, 1.18];
    view.position.forEach((v, i) => expect(v).toBeCloseTo(expected[i]));
    expect(view.near).toBeCloseTo(0.03);
    expect(view.fov).toBe(seat === "rear" ? 78 : 72);
  },
);
