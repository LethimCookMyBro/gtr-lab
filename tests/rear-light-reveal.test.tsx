// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  AmbientLight,
  DirectionalLight,
  Fog,
  type Light,
  PerspectiveCamera,
  PointLight,
  RectAreaLight,
  Scene,
  Vector3,
} from "three";
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
  runtime.state.scene.fog = new Fog("#030405", 13, 30);
});
afterEach(cleanup);
const props = { onReady: () => {}, onError: () => {}, onProgress: () => {} };
function settle() {
  for (let i = 0; i < 80; i++)
    runtime.frames.forEach((frame) => frame({}, 1 / 30));
}
function addStudioLights() {
  const lights: [string, Light][] = [
    ["rear-key", new DirectionalLight()],
    ["rear-fill", new AmbientLight()],
    ["rear-roof", new RectAreaLight()],
    ["rear-sweep", new RectAreaLight()],
    ...Array.from({ length: 4 }, (_, index): [string, Light] => [
      `rear-lens-spill-${index}`,
      new PointLight("#ff170b", 0.018),
    ]),
  ];
  for (const [name, light] of lights) {
    light.name = name;
    runtime.state.scene.add(light);
  }
  return lights.map(([, light]) => light);
}

function lightLevels() {
  return [
    runtime.state.scene.environmentIntensity,
    ...[
      "rear-key",
      "rear-fill",
      "rear-roof",
      "rear-sweep",
      ...Array.from({ length: 4 }, (_, index) => `rear-lens-spill-${index}`),
    ].map((name) => runtime.state.scene.getObjectByName(name).intensity),
  ];
}

it("opens on black with no incident studio or lens-spill illumination", () => {
  const lights = addStudioLights();
  render(<RearVehicleScene {...props} progress={0} reducedMotion={false} />);
  settle();
  expect(runtime.state.scene.environmentIntensity).toBe(0);
  for (const light of lights) expect(light.intensity).toBe(0);
  expect(runtime.state.scene.background.getHexString()).toBe("000000");
  expect(runtime.state.scene.fog.color.getHexString()).toBe("000000");
});

it("keeps the native-scroll midpoint restrained instead of flooding the shell", () => {
  addStudioLights();
  render(<RearVehicleScene {...props} progress={0.5} reducedMotion={false} />);
  settle();
  const levels = lightLevels();
  expect(levels[0]).toBeGreaterThan(0.15);
  expect(levels[0]).toBeLessThan(0.35);
  expect(levels[4]).toBeLessThan(1.2);
});

it("reveals the studio gradually across native scroll and returns to the same darkness in reverse", () => {
  addStudioLights();
  const { rerender } = render(
    <RearVehicleScene {...props} progress={0} reducedMotion={false} />,
  );
  const levels = new Map<number, number[]>();
  let previousEnvironment = 0;
  for (const progress of [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1]) {
    runtime.frames = [];
    rerender(
      <RearVehicleScene {...props} progress={progress} reducedMotion={false} />,
    );
    runtime.frames.forEach((frame) => frame({}, 1 / 60));
    const current = lightLevels();
    expect(current[0]).toBeGreaterThanOrEqual(previousEnvironment);
    previousEnvironment = current[0];
    levels.set(progress, current);
    if (progress <= 0.2) expect(current).toEqual(Array(9).fill(0));
    if (progress === 0.5) {
      expect(current[0]).toBeGreaterThan(0.15);
      expect(current[0]).toBeLessThan(0.35);
      expect(current[4]).toBeLessThan(1.2);
    }
    if (progress === 0.9) expect(current[0]).toBeLessThan(0.98);
  }
  expect(levels.get(1)).toEqual([
    0.98, 0.968, 0.087, 3.4, 0, 0.018, 0.018, 0.018, 0.018,
  ]);
  for (const progress of [0.9, 0.7, 0.5, 0.3, 0.2, 0.1, 0]) {
    runtime.frames = [];
    rerender(
      <RearVehicleScene {...props} progress={progress} reducedMotion={false} />,
    );
    runtime.frames.forEach((frame) => frame({}, 1 / 60));
    expect(lightLevels()).toEqual(levels.get(progress));
    expect(runtime.state.gl.domElement.dataset.rearProgress).toBe(
      progress.toFixed(4),
    );
  }
  expect(runtime.state.scene.background.getHexString()).toBe("000000");
  expect(runtime.state.scene.fog.color.getHexString()).toBe("000000");
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
  addStudioLights();
  render(<RearVehicleScene {...props} progress={0} reducedMotion />);
  settle();
  expect(lightLevels()).toEqual([
    0.98, 0.968, 0.087, 3.4, 0, 0.018, 0.018, 0.018, 0.018,
  ]);
  expect(runtime.state.scene.background.getHexString()).toBe("030405");
  expect(runtime.state.scene.fog.color.getHexString()).toBe("030405");
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

it("reveals a broad neutral roof source and restrained fill only after the real lamps", () => {
  const roof = new RectAreaLight("#ffffff", 0, 6, 3);
  roof.name = "rear-roof";
  const fill = new AmbientLight("#ffffff", 0);
  fill.name = "rear-fill";
  const key = new DirectionalLight("#ffffff", 0);
  key.name = "rear-key";
  runtime.state.scene.add(roof, fill, key);
  const { rerender } = render(
    <RearVehicleScene {...props} progress={0.1} reducedMotion={false} />,
  );
  settle();
  expect(roof.intensity).toBe(0);
  expect(fill.intensity).toBe(0);
  expect(key.intensity).toBe(0);
  runtime.frames = [];
  rerender(<RearVehicleScene {...props} progress={1} reducedMotion={false} />);
  settle();
  expect(roof.intensity).toBeGreaterThanOrEqual(3);
  expect(fill.intensity).toBeGreaterThanOrEqual(0.07);
  expect(fill.intensity).toBeLessThanOrEqual(0.2);
  expect(key.intensity).toBeGreaterThanOrEqual(0.85);
  expect(key.intensity).toBeLessThanOrEqual(1.1);
  expect(roof.color.r).toBe(roof.color.g);
  expect(roof.color.g).toBe(roof.color.b);
});
