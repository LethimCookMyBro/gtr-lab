import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import {
  applyVehicleAppearance,
  prepareVehicle,
} from "../src/components/three/materialAdapter";
import { getModel } from "../src/data/models";

function specimen() {
  const source = new Group();
  const metal = new MeshStandardMaterial({
    color: "#1e1e1e",
    metalness: 0.79,
    roughness: 0.000897,
  });
  metal.name = "Metal.001";
  metal.normalMap = new Texture();
  const geometry = new BoxGeometry(2, 1, 4);
  const names = [
    "Brakes_Metal001_0",
    "Front_Bumper001_Metal001_0",
    "Front_Bumper007_Reflective_Plastic_0",
    "Side_Mirror_Reflective_Plastic_0",
  ];
  names.forEach((name, i) => {
    const mesh = new Mesh(geometry, metal);
    mesh.name = name;
    if (i === 0) mesh.userData.name = "Brakes_Metal.001_0";
    source.add(mesh);
  });
  const roles = {
    paint: [],
    headlights: [],
    taillights: [],
    wheelFinish: ["Brakes_Metal.001_0"],
    lowerTrimFinish: [names[2]],
  };
  return { source, metal, geometry, roles };
}

describe("declared wheel and lower trim finishes", () => {
  it("softens only the identified wheel and lower trim surfaces without mutating shared badges, grille or mirrors", () => {
    const s = specimen();
    const asset = prepareVehicle(s.source, s.roles);
    const materials = asset.scene.children.map((object) => {
      if (
        !(object instanceof Mesh) ||
        !(object.material instanceof MeshStandardMaterial)
      )
        throw new Error("Missing mesh");
      expect(object.geometry).toBe(s.geometry);
      expect(object.material.normalMap).toBe(s.metal.normalMap);
      expect(object.material.color.equals(s.metal.color)).toBe(true);
      expect(object.material.metalness).toBe(s.metal.metalness);
      return object.material;
    });
    expect(materials[0].roughness).toBe(0.24);
    expect(materials[2].roughness).toBe(0.28);
    expect(materials[1].roughness).toBe(0.000897);
    expect(materials[3]).toBe(materials[1]);
    expect(materials[0]).not.toBe(materials[1]);
    expect(materials[2]).not.toBe(materials[1]);
    expect(s.metal.roughness).toBe(0.000897);
    applyVehicleAppearance(asset.bindings, "#ff0000", true);
    expect(materials[0].color.equals(s.metal.color)).toBe(true);
    expect(materials[0].emissive.getHex()).toBe(0);
    asset.dispose();
  });
  it("declares one existing wheel mesh and three lower trim meshes, excluding mirror shells and the floor pan", () => {
    const roles = getModel("premium")?.asset.materialRoles;
    expect(roles?.wheelFinish).toEqual(["Brakes_Metal.001_0"]);
    expect(roles?.lowerTrimFinish).toEqual([
      "Front Bumper.007_Reflective Plastic_0",
      "DoorStep_Reflective Plastic_0",
      "Rear bottom Bumper_Reflective Plastic_0",
    ]);
  });
});
