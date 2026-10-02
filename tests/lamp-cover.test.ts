import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { prepareVehicle } from "../src/components/three/materialAdapter";

describe("declared optical lamp covers", () => {
  it("reveals emitters behind explicitly declared lenses while preserving windows and housings", () => {
    const source = new Group();
    const glass = new MeshStandardMaterial({
      color: "#000000",
      transparent: true,
      opacity: 0.888,
      roughness: 0,
    });
    glass.name = "Glass";
    const geometry = new BoxGeometry(2, 1, 4);
    for (const name of [
      "Headlights_Glass_0",
      "Headlights001_Glass_0",
      "Window_Glass_0",
    ]) {
      const mesh = new Mesh(geometry, glass);
      mesh.name = name;
      source.add(mesh);
    }
    const asset = prepareVehicle(source, {
      paint: [],
      headlights: [],
      taillights: [],
      lampCovers: ["Headlights_Glass_0"],
    });
    const [lens, housing, window] = asset.scene.children as Mesh[];
    const material = lens.material as MeshStandardMaterial;
    expect(material.opacity).toBeLessThanOrEqual(0.15);
    expect(material.depthWrite).toBe(false);
    expect(material.emissiveIntensity).toBe(1);
    expect(material.emissive.getHex()).toBe(0);
    expect((housing.material as MeshStandardMaterial).opacity).toBe(0.888);
    expect((window.material as MeshStandardMaterial).opacity).toBe(0.888);
    expect(lens.material).not.toBe(housing.material);
    expect(glass.opacity).toBe(0.888);
    expect(lens.geometry).toBe(geometry);
  });
});
