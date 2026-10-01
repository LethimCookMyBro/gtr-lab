import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import {
  prepareVehicle,
  applyVehicleAppearance,
} from "../src/components/three/materialAdapter";

describe("declared inactive lamps", () => {
  it("disables only the exact named emitter after cloning and keeps it off during light toggles", () => {
    const source = new Group();
    const reverse = new MeshStandardMaterial({
      emissive: "#ffffff",
      emissiveIntensity: 10,
    });
    reverse.name = "Reverse_Emitter";
    const rear = new MeshStandardMaterial({
      emissive: "#ff0000",
      emissiveIntensity: 10,
    });
    rear.name = "Taillight_Emitter";
    const unrelated = new MeshStandardMaterial({
      emissive: "#0077cc",
      emissiveIntensity: 0.4,
    });
    unrelated.name = "reverse_emitter";
    const geometry = new BoxGeometry(2, 1, 4);
    source.add(
      new Mesh(geometry, reverse),
      new Mesh(geometry, rear),
      new Mesh(geometry, unrelated),
    );
    const asset = prepareVehicle(
      source,
      { paint: [], headlights: [], taillights: ["Taillight_Emitter"] },
      ["Reverse_Emitter"],
    );
    const [reverseMesh, rearMesh, otherMesh] = asset.scene.children as Mesh[];
    const reverseCopy = reverseMesh.material as MeshStandardMaterial;
    expect(reverseCopy.emissiveIntensity).toBe(0);
    expect(reverse.emissiveIntensity).toBe(10);
    expect((otherMesh.material as MeshStandardMaterial).emissiveIntensity).toBe(
      0.4,
    );
    applyVehicleAppearance(asset.bindings, "#ffffff", true);
    expect(reverseCopy.emissiveIntensity).toBe(0);
    expect(
      (rearMesh.material as MeshStandardMaterial).emissiveIntensity,
    ).toBeGreaterThan(0);
    applyVehicleAppearance(asset.bindings, "#ffffff", false);
    expect(reverseCopy.emissiveIntensity).toBe(0);
    asset.dispose();
  });
});
