import { describe, it, expect } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3 } from "three";
import { createFixtureGlb, QA_MATERIAL_ROLES } from "../qa/renderer/fixture";
import { rendererQaConfig } from "../vite.renderer-qa.config";
import {
  prepareVehicle,
  vehicleCapabilities,
} from "../src/components/three/materialAdapter";

describe("isolated renderer QA build", () => {
  it("refuses the default and production modes", () => {
    expect(() => rendererQaConfig("development")).toThrow(/renderer-qa/);
    expect(() => rendererQaConfig("production")).toThrow(/renderer-qa/);
    const config = rendererQaConfig("renderer-qa");
    expect(config.root).toMatch(/qa\/renderer$/);
    expect(config.publicDir).toBe(false);
    expect(config.build?.outDir).toMatch(/qa-dist$/);
    expect(config.server?.host).toBe("127.0.0.1");
  });
  it("creates a valid test-only GLB with paint and emitter roles", async () => {
    const bytes = createFixtureGlb();
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    expect(gltf.scene.name).toBe("QA_ONLY_NOT_A_VEHICLE");
    const prepared = prepareVehicle(gltf.scene, QA_MATERIAL_ROLES);
    expect(vehicleCapabilities(prepared.bindings)).toEqual({
      paint: true,
      lights: true,
    });
    const size = new Box3()
      .setFromObject(prepared.scene)
      .getSize(new (await import("three")).Vector3());
    expect(Math.max(size.x, size.z) * prepared.scale).toBeCloseTo(4.7);
    prepared.dispose();
  });
});
