// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import RearVehicleScene from "../src/components/home/RearVehicleScene";

const runtime = vi.hoisted(() => ({ state: {} as any, canvas: {} as any }));
vi.mock("@react-three/fiber", () => ({
  Canvas: (props: any) => {
    runtime.canvas = props;
    return props.children;
  },
  useThree: (select: any) => select(runtime.state),
  useFrame: () => {},
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => null,
}));
const callbacks = {
  onReady: () => {},
  onError: () => {},
  onProgress: () => {},
};
const view = (progress = 0, reducedMotion = false, active = true) => (
  <RearVehicleScene
    {...callbacks}
    progress={progress}
    reducedMotion={reducedMotion}
    active={active}
  />
);
function appliedDpr() {
  return runtime.canvas.dpr as number;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("devicePixelRatio", 3);
  vi.stubGlobal("innerWidth", 390);
  runtime.state = {
    camera: new PerspectiveCamera(),
    scene: new Scene(),
    size: { width: 390, height: 844 },
    gl: { domElement: document.createElement("canvas") },
    invalidate: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each([2, 3, 4])(
  "starts a 390px phone at bounded retina resolution on a DPR %s screen",
  (nativeDpr) => {
    vi.stubGlobal("devicePixelRatio", nativeDpr);
    render(view());
    expect(appliedDpr()).toBe(2);
    expect(390 * appliedDpr()).toBe(780);
    expect(runtime.canvas.gl.antialias).toBe(true);
  },
);
it("restores full still quality after a moving reveal settles", () => {
  const { rerender } = render(view(0));
  rerender(view(0.4));
  expect(appliedDpr()).toBe(1.25);
  act(() => vi.advanceTimersByTime(180));
  expect(appliedDpr()).toBe(2);
});
it("renders the final reveal and reduced motion crisply without an idle delay", () => {
  const { rerender } = render(view(0.4));
  rerender(view(1));
  expect(appliedDpr()).toBe(2);
  rerender(view(0.6, true));
  expect(appliedDpr()).toBe(2);
});
it("bounds a retina desktop's physical buffer while respecting native one-pixel screens", () => {
  runtime.state.size = { width: 1920, height: 1080 };
  const { rerender } = render(view());
  expect(appliedDpr()).toBeGreaterThan(1);
  expect(1920 * 1080 * appliedDpr() ** 2).toBeLessThanOrEqual(2_500_001);
  vi.stubGlobal("devicePixelRatio", 1);
  rerender(view(0.1));
  expect(appliedDpr()).toBe(1);
});
it("cancels motion recovery on unmount and preserves the offscreen never frameloop", () => {
  const { rerender, unmount } = render(view());
  rerender(view(0.4));
  rerender(view(0.4, false, false));
  expect(runtime.canvas.frameloop).toBe("never");
  unmount();
  const quality = runtime.state.gl.domElement.dataset.rearQuality;
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(1000));
  expect(runtime.state.gl.domElement.dataset.rearQuality).toBe(quality);
});
