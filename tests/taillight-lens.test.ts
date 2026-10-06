import { describe, expect, it } from "vitest";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  BoxGeometry,
  Texture,
} from "three";
import {
  prepareVehicle,
  applyVehicleAppearance,
  vehicleCapabilities,
} from "../src/components/three/materialAdapter";
import { getModel } from "../src/data/models";

function specimen() {
  const source = new Group();
  const glass = new MeshStandardMaterial({
    color: "#490006",
    opacity: 0.968,
    transparent: true,
    metalness: 0.35,
    roughness: 0,
  });
  glass.name = "Red_Lens";
  glass.normalMap = new Texture();
  // Real ring topology provides a hole instead of a disc or synthetic glow.
  const geometry = new RingGeometry(0.065, 0.13, 48);
  for (let i = 0; i < 4; i++) {
    const mesh = new Mesh(geometry, glass);
    mesh.name = `lens-${i}`;
    mesh.position.x = (i - 1.5) * 0.3;
    source.add(mesh);
  }
  const unrelated = new Mesh(new BoxGeometry(), glass);
  unrelated.name = "unrelated-red-trim";
  source.add(unrelated);
  const emitter = new MeshStandardMaterial({
    emissive: "#ff2118",
    emissiveIntensity: 10,
  });
  emitter.name = "Taillight_Emitter";
  source.add(new Mesh(geometry, emitter));
  const roles = {
    paint: [],
    headlights: [],
    taillights: ["Taillight_Emitter"],
    taillightLenses: ["lens-0", "lens-1", "lens-2", "lens-3"],
  };
  return { source, glass, geometry, roles };
}

describe("existing red rear lens surfaces", () => {
  it("keeps four red lenses visibly tinted with lights off instead of turning them into clear covers", () => {
    const s = specimen();
    const asset = prepareVehicle(s.source, s.roles);
    const mesh = asset.scene.children[0];
    expect(mesh).toBeInstanceOf(Mesh);
    if (
      !(mesh instanceof Mesh) ||
      !(mesh.material instanceof MeshStandardMaterial)
    )
      throw new Error("Missing lens");
    applyVehicleAppearance(asset.bindings, "#ffffff", false);
    expect(mesh.material.opacity).toBe(0.96);
    expect(mesh.material.color.equals(s.glass.color)).toBe(true);
    expect(mesh.material.roughness).toBe(0.26);
    expect(mesh.material.metalness).toBe(0);
    expect(mesh.material.emissiveIntensity).toBe(0);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.normalMap).toBe(s.glass.normalMap);
    expect(
      asset.bindings.filter((binding) => binding.role === "taillight-lens"),
    ).toHaveLength(1);
    expect(s.glass.opacity).toBe(0.968);
    asset.dispose();
  });
  it("lights the existing annuli and restores the same unlit material without touching holes, transforms or unrelated shared materials", () => {
    const s = specimen();
    const asset = prepareVehicle(s.source, s.roles);
    const meshes = asset.scene.children;
    const lens = meshes[0];
    const trim = meshes[4];
    const emitter = meshes[5];
    if (
      !(lens instanceof Mesh) ||
      !(lens.material instanceof MeshStandardMaterial) ||
      !(trim instanceof Mesh) ||
      !(trim.material instanceof MeshStandardMaterial) ||
      !(emitter instanceof Mesh) ||
      !(emitter.material instanceof MeshStandardMaterial)
    )
      throw new Error("Missing parts");
    const originalLensColor = lens.material.color.clone();
    for (let cycle = 0; cycle < 3; cycle++) {
      applyVehicleAppearance(asset.bindings, "#ffffff", true);
      expect(lens.material.emissiveIntensity).toBe(0.92);
      expect(lens.material.emissive.getHexString()).toBe("ff0905");
      expect(lens.material.toneMapped).toBe(false);
      expect(emitter.material.emissiveIntensity).toBe(0.14);
      applyVehicleAppearance(asset.bindings, "#ffffff", false);
      expect(lens.material.emissiveIntensity).toBe(0);
      expect(lens.material.color.equals(originalLensColor)).toBe(true);
    }
    meshes.slice(0, 4).forEach((mesh, i) => {
      if (!(mesh instanceof Mesh)) throw new Error("Missing annulus");
      expect(mesh.geometry).toBe(s.geometry);
      expect(mesh.position.x).toBe((i - 1.5) * 0.3);
    });
    expect(trim.material).not.toBe(lens.material);
    expect(trim.material.opacity).toBe(0.968);
    expect(trim.material.roughness).toBe(0);
    expect(trim.material.emissiveIntensity).toBe(1);
    expect(vehicleCapabilities(asset.bindings).lights).toBe(true);
    asset.dispose();
  });
  it("declares only the verified annular material in the licensed manifest", () => {
    const asset = getModel("premium")?.asset;
    expect(asset?.materialRoles.taillightLenses).toEqual(["Glass.001"]);
    expect(asset?.materialRoles.lampCovers).not.toContain(
      "TailightsGlass_Glass.001_0",
    );
  });
});
