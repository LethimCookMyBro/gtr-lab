// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PerspectiveCamera, RectAreaLight, Scene, Vector3 } from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";
const runtime = vi.hoisted(() => ({
  state: {} as any,
  frames: [] as ((state: unknown, delta: number) => void)[],
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: import("react").ReactNode }) => children,
  useThree: (select: (state: any) => unknown) => select(runtime.state),
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    runtime.frames.push(callback);
  },
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => null,
}));
beforeEach(() => {
  runtime.frames = [];
  runtime.state = {
    camera: new PerspectiveCamera(),
    size: { width: 1440, height: 900 },
    scene: new Scene(),
    invalidate: () => {},
    gl: { domElement: document.createElement("canvas") },
  };
});
afterEach(cleanup);
const props = { onReady: () => {}, onError: () => {}, onProgress: () => {} };
function settle() {
  for (let i = 0; i < 80; i++)
    runtime.frames.forEach((frame) => frame({}, 1 / 30));
}
it("keeps the body studio dark for the initial actual-lamp silhouette, then reveals it with scroll", () => {
  const { rerender } = render(
    <RearVehicleScene {...props} progress={0} reducedMotion={false} />,
  );
  settle();
  expect(runtime.state.scene.environmentIntensity).toBe(0);
  rerender(<RearVehicleScene {...props} progress={1} reducedMotion={false} />);
  settle();
  expect(runtime.state.scene.environmentIntensity).toBeGreaterThan(0.7);
});
it.each([
  [1440, 900],
  [390, 844],
])(
  "keeps the complete rear centered and within the viewport at %s×%s",
  (width, height) => {
    runtime.state.size = { width, height };
    render(<RearVehicleScene {...props} progress={1} reducedMotion />);
    settle();
    const camera = runtime.state.camera as PerspectiveCamera;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    expect(camera.position.x).toBe(0);
    // Measured source extrema, mirrored across its centerline to cover both sides.
    for (const point of [
      [-0.96, 0, -2.15],
      [0.96, 0, -2.15],
      [0, 1.362, -0.869],
    ]) {
      const p = new Vector3(...point).project(camera);
      expect(Math.abs(p.x)).toBeLessThan(0.91);
      expect(p.y).toBeGreaterThan(width > 700 ? -0.61 : -0.48);
      expect(p.y).toBeLessThan(width > 700 ? 0.78 : 0.43);
    }
  },
);

it("applies native scroll progress in one demand frame without trailing camera redraws", () => {
  const invalidate = vi.fn();
  runtime.state.invalidate = invalidate;
  const { rerender } = render(
    <RearVehicleScene {...props} progress={0} reducedMotion={false} />,
  );
  runtime.frames.forEach((frame) => frame({}, 1 / 60));
  runtime.frames = [];
  rerender(
    <RearVehicleScene {...props} progress={0.5} reducedMotion={false} />,
  );
  invalidate.mockClear();
  runtime.frames.forEach((frame) => frame({}, 1 / 60));
  expect(runtime.state.gl.domElement.dataset.rearProgress).toBe("0.5000");
  expect(invalidate).not.toHaveBeenCalled();
});

// This deliberately exercises the mounted camera rather than a copy of its maths.
it.each([
  [1920, 900, 0.44],
  [1440, 900, 0.59],
])(
  "makes the complete rear the main exhibit at %s×%s",
  (width, height, minimumWidth) => {
    runtime.state.size = { width, height };
    render(<RearVehicleScene {...props} progress={1} reducedMotion={false} />);
    settle();
    const camera = runtime.state.camera as PerspectiveCamera;
    camera.updateMatrixWorld();
    const left = new Vector3(-0.96, 0.7, -2.15).project(camera);
    const right = new Vector3(0.96, 0.7, -2.15).project(camera);
    const widthFraction = Math.abs(right.x - left.x) / 2;
    expect(widthFraction).toBeGreaterThan(minimumWidth);
    expect(widthFraction).toBeLessThan(0.9);
  },
);

it("sweeps one real white studio source over the shoulders and exhaust after the lamps lead", () => {
  const sweep = new RectAreaLight("#ffffff", 0, 2.8, 0.45);
  sweep.name = "rear-sweep";
  runtime.state.scene.add(sweep);
  const { rerender } = render(
    <RearVehicleScene {...props} progress={0.1} reducedMotion={false} />,
  );
  settle();
  expect(sweep.intensity).toBe(0);
  const positions: number[][] = [];
  for (const progress of [0.3, 0.5, 0.7]) {
    runtime.frames = [];
    rerender(
      <RearVehicleScene {...props} progress={progress} reducedMotion={false} />,
    );
    settle();
    expect(sweep.intensity).toBeGreaterThan(0);
    positions.push(sweep.position.toArray());
  }
  expect(positions[0][0]).toBeLessThan(positions[2][0]);
  expect(positions[0][1]).toBeGreaterThan(positions[2][1]);
  runtime.frames = [];
  rerender(<RearVehicleScene {...props} progress={1} reducedMotion={false} />);
  settle();
  expect(sweep.intensity).toBe(0);
  expect(runtime.state.scene.environmentIntensity).toBeGreaterThan(0.7);
});

it("shows the settled studio with no reflection sweep in reduced motion", () => {
  const sweep = new RectAreaLight("#ffffff", 4);
  sweep.name = "rear-sweep";
  runtime.state.scene.add(sweep);
  render(<RearVehicleScene {...props} progress={0} reducedMotion />);
  settle();
  expect(sweep.intensity).toBe(0);
  expect(runtime.state.scene.environmentIntensity).toBeGreaterThan(0.7);
});

it.each([
  [1920, 900],
  [1440, 900],
  [1280, 720],
  [1024, 600],
])(
  "leaves a separate caption band below the full car at %s×%s",
  (width, height) => {
    runtime.state.size = { width, height };
    render(<RearVehicleScene {...props} progress={1} reducedMotion={false} />);
    settle();
    const camera = runtime.state.camera as PerspectiveCamera;
    camera.updateMatrixWorld();
    const conservativeTyreBottom =
      ((1 - new Vector3(0, 0, -2.35).project(camera).y) * height) / 2;
    // Text uses its real fluid font size and 1.25 leading. Allow its supporting
    // line, margin and an explicit 12px gap above the caption band.
    const heading = Math.max(19, Math.min(width * 0.021, 32)) * 1.25;
    const captionTop = height * 0.91 - heading - 10 - 13 * 1.6;
    expect(conservativeTyreBottom + 12).toBeLessThanOrEqual(captionTop);
  },
);
