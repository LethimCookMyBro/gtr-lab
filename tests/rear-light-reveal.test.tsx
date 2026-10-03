// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PerspectiveCamera, Scene, Vector3 } from "three";
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
      expect(p.y).toBeGreaterThan(-0.48);
      expect(p.y).toBeLessThan(0.43);
    }
  },
);
