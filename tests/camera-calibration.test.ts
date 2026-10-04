import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  cameraView,
  CAMERA_VIEWS,
  exteriorDistanceScale,
  VENUE_CAMERA_RADIUS,
} from "../src/components/three/sceneHelpers";

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

// Extrema sampled from all 517,016 approved exterior vertices (fa889f70…),
// after the same grounding/4.7m normalization used by prepareVehicle.
const exteriorLandmarks = [
  [-0.6740322, 0.1912318, 2.2485371],
  [-0.8124396, 0.1912318, 2.1611964],
  [0, 1.3613797, -0.8686962],
  [0.8697681, 0.4342193, -2.1470743],
  [0.9317988, 0.0255527, 1.4941105],
  [0.926609, 0.0174091, 1.4654582],
  [0.932835, 0.0208441, 1.4757633],
];

it.each([
  [1440, 744, 0.5, 0.55],
  [390, 392, 0.8, 0.85],
  [430, 480, 0.8, 0.85],
  [320, 392, 0.78, 0.85],
  [390, 482, 0.78, 0.85],
])(
  "frames the complete licensed hero inside the %s×%s viewport",
  (width, height, minimumWidth, maximumWidth) => {
    const view = CAMERA_VIEWS.hero;
    const target = new Vector3(...view.target);
    const aspect = width / height;
    const fovScale = Math.min(1.25, Math.max(1, 1 / aspect));
    const camera = new PerspectiveCamera(
      view.fov * fovScale,
      aspect,
      0.02,
      150,
    );
    const position = new Vector3(...view.position);
    camera.position
      .copy(position)
      .sub(target)
      .multiplyScalar(
        exteriorDistanceScale(fovScale, position.distanceTo(target), width),
      )
      .add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const projected = exteriorLandmarks.map((point) => {
      const p = new Vector3().fromArray(point).project(camera);
      return [((p.x + 1) * width) / 2, ((1 - p.y) * height) / 2];
    });
    const left = Math.min(...projected.map((p) => p[0]));
    const right = Math.max(...projected.map((p) => p[0]));
    expect((right - left) / width).toBeGreaterThanOrEqual(minimumWidth);
    expect((right - left) / width).toBeLessThanOrEqual(maximumWidth);
    expect(left).toBeGreaterThan(16);
    expect(right).toBeLessThan(width - 16);
    expect(Math.min(...projected.map((p) => p[1]))).toBeGreaterThan(16);
    expect(Math.max(...projected.map((p) => p[1]))).toBeLessThan(height - 80);
  },
);

it("preserves narrow-screen framing when the separate header makes the canvas square", () => {
  expect(exteriorDistanceScale(1, 6, 390)).toBe(1.22);
  expect(exteriorDistanceScale(1, 6, 760)).toBe(1.22);
  expect(exteriorDistanceScale(1, 6, 761)).toBe(1);
  expect(exteriorDistanceScale(1.25, 6, 390)).toBe(1.25);
  expect(exteriorDistanceScale(1, 8)).toBe(1);
});

it("keeps portrait cameras and zoom inside the clear 11m venue envelope", () => {
  expect(exteriorDistanceScale(2.2, 10)).toBeCloseTo(1.1);
  expect(exteriorDistanceScale(2.2, 6)).toBeCloseTo(11 / 6);
  for (const [preset, view] of Object.entries(CAMERA_VIEWS)) {
    if (preset === "wheel" || preset === "interior") continue;
    const distance = new Vector3(...view.position).distanceTo(
      new Vector3(...view.target),
    );
    for (const requested of [1, 1.25]) {
      const scale = exteriorDistanceScale(requested, distance, 390);
      expect(distance * scale).toBeLessThanOrEqual(VENUE_CAMERA_RADIUS + 1e-10);
      expect(
        Math.min(VENUE_CAMERA_RADIUS, view.maxDistance * scale),
      ).toBeLessThanOrEqual(VENUE_CAMERA_RADIUS);
    }
  }
});
