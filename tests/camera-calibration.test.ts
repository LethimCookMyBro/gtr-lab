import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
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

// Extrema sampled from the approved 517,016-vertex exterior (fa889f70…),
// covering front bumper, roof, rear bumper, and both projected tyre limits.
const exteriorLandmarks = [
  [-0.6740267, 0.191202, 2.2484972],
  [-0.812433, 0.191202, 2.1611571],
  [0, 1.3613404, -0.8687107],
  [0.869761, 0.4341875, -2.1470783],
  [0.9317912, 0.0255243, 1.4940768],
  [0.9266014, 0.0173807, 1.4654247],
];

it.each([
  [1440, 744, 0.5, 0.55, 0],
  [390, 482, 0.8, 0.85, 120],
])(
  "frames the licensed hero prominently and clear of controls at %s×%s",
  (width, height, minimumWidth, maximumWidth, top) => {
    const view = CAMERA_VIEWS.hero;
    const target = new Vector3(...view.target);
    const camera = new PerspectiveCamera(view.fov, width / height, 0.02, 150);
    camera.position
      .set(...view.position)
      .sub(target)
      .multiplyScalar(Math.min(2.2, Math.max(1, 1.2 / camera.aspect)))
      .add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const projected = exteriorLandmarks.map((point) => {
      const p = new Vector3().fromArray(point).project(camera);
      return [((p.x + 1) * width) / 2, ((1 - p.y) * height) / 2 + top];
    });
    const left = Math.min(...projected.map((p) => p[0]));
    const right = Math.max(...projected.map((p) => p[0]));
    expect((right - left) / width).toBeGreaterThanOrEqual(minimumWidth);
    expect((right - left) / width).toBeLessThanOrEqual(maximumWidth);
    expect(left).toBeGreaterThan(16);
    expect(right).toBeLessThan(width - 16);
    expect(Math.min(...projected.map((p) => p[1]))).toBeGreaterThan(225);
    const topEdge = Math.min(...projected.map((p) => p[1]));
    const bottomEdge = Math.max(...projected.map((p) => p[1]));
    expect(bottomEdge).toBeLessThan(top + height - 100);
    if (width < 500) {
      expect((topEdge + bottomEdge) / 2).toBeGreaterThan(355);
      expect((topEdge + bottomEdge) / 2).toBeLessThan(415);
    }
  },
);
