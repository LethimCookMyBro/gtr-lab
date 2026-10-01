import { describe, expect, it } from "vitest";
import { cameraView, CAMERA_VIEWS } from "../src/components/three/sceneHelpers";

describe("per-asset camera calibration", () => {
  it("uses a verified interior seat view without changing unrelated presets", () => {
    const interior = {
      ...CAMERA_VIEWS.interior,
      position: [0.28, 1.02, -0.26] as [number, number, number],
    };
    expect(cameraView("interior", { interior })).toBe(interior);
    expect(cameraView("hero", { interior })).toBe(CAMERA_VIEWS.hero);
    expect(cameraView("unknown", { interior })).toBe(CAMERA_VIEWS.hero);
  });
});
