// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three-stdlib";
import { connectExteriorKeyboard } from "../src/components/three/keyboardControls";

const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach((release) => release()));

function fixture() {
  const canvas = document.createElement("canvas");
  const camera = new PerspectiveCamera(34, 1920 / 924, 0.02, 700);
  camera.position.set(4.275, 1.8675, 5.1);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.72, 0);
  controls.minDistance = 2.7;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.005;
  controls.maxPolarAngle = Math.PI / 2 - 0.025;
  controls.update();
  const invalidate = vi.fn();
  const manual = vi.fn();
  const reset = vi.fn();
  // Real Drei's change listener invalidates independently of our keyboard handler.
  controls.addEventListener("change", invalidate);
  const disconnect = connectExteriorKeyboard({
    canvas,
    camera,
    controls,
    onManual: manual,
    onReset: reset,
    invalidate,
  });
  releases.push(() => {
    disconnect();
    controls.dispose();
  });
  const key = (value: string, count = 1) => {
    for (let i = 0; i < count; i++)
      canvas.dispatchEvent(
        new KeyboardEvent("keydown", { key: value, cancelable: true }),
      );
  };
  const pose = () => ({
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    projection: camera.projectionMatrix.toArray(),
  });
  return { canvas, camera, controls, invalidate, manual, reset, key, pose };
}

it.each([
  ["+", 40],
  ["-", 50],
] as const)(
  "clamped %s preserves the exact pose without requesting redundant work",
  (key, count) => {
    const f = fixture();
    f.key(key, count);
    const before = f.pose();
    f.invalidate.mockClear();
    f.manual.mockClear();
    f.key(key, 2);
    expect(f.pose()).toEqual(before);
    expect(f.manual).toHaveBeenCalledTimes(2);
    expect(f.invalidate).not.toHaveBeenCalled();
  },
);

it("a genuine keyboard zoom still invalidates and Home still requests a transition", () => {
  const f = fixture();
  const before = f.pose();
  f.key("+");
  expect(f.pose()).not.toEqual(before);
  expect(f.invalidate).toHaveBeenCalled();
  f.invalidate.mockClear();
  f.key("Home");
  expect(f.reset).toHaveBeenCalledOnce();
  expect(f.invalidate).toHaveBeenCalledOnce();
});

it("a clamped key still drains genuine pending damping and invalidates its changed pose", () => {
  const f = fixture();
  f.key("+", 40);
  f.controls.enableDamping = true;
  f.controls.dampingFactor = 0.09;
  f.controls.setAzimuthalAngle(f.controls.getAzimuthalAngle() + 0.5);
  const before = f.pose();
  f.invalidate.mockClear();
  f.key("+");
  expect(f.pose()).not.toEqual(before);
  expect(f.invalidate).toHaveBeenCalled();
  expect(f.controls.enableDamping).toBe(true);
});

it("native wheel input remains connected and requests rendering when it changes the camera", () => {
  const f = fixture();
  f.key("+", 40);
  f.invalidate.mockClear();
  const before = f.pose();
  f.canvas.dispatchEvent(
    new WheelEvent("wheel", { deltaY: 100, cancelable: true }),
  );
  expect(f.pose()).not.toEqual(before);
  expect(f.invalidate).toHaveBeenCalled();
});
