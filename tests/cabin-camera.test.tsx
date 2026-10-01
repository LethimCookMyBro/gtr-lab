// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { CameraRig } from "../src/components/three/CameraRig";
import {
  CAMERA_VIEWS,
  type CameraView,
} from "../src/components/three/sceneHelpers";

// Mock only R3F's WebGL host. The rig, DOM input and Three camera/controls are real.
const host = vi.hoisted(() => ({
  state: null as unknown as {
    camera: PerspectiveCamera;
    size: { width: number; height: number };
    gl: { domElement: HTMLCanvasElement };
    invalidate: () => void;
  },
  frames: new Map<
    object,
    { priority: number; callback: (state: unknown, delta: number) => void }
  >(),
  controls: null as Controls | null,
}));
vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return {
    useThree: (selector: (state: typeof host.state) => unknown) =>
      selector(host.state),
    useFrame: (
      callback: (state: unknown, delta: number) => void,
      priority = 0,
    ) => {
      const key = React.useRef({});
      React.useLayoutEffect(() => {
        host.frames.set(key.current, { priority, callback });
        return () => {
          host.frames.delete(key.current);
        };
      });
    },
  };
});
vi.mock("@react-three/drei/core/OrbitControls", async () => {
  const React = await import("react");
  const { OrbitControls } = await import("three-stdlib");
  const { useFrame } = await import("@react-three/fiber");
  return {
    OrbitControls: React.forwardRef<Controls, Record<string, unknown>>(
      (props, ref) => {
        const controls = React.useMemo(
          () => new OrbitControls(host.state.camera),
          [],
        );
        React.useImperativeHandle(ref, () => controls);
        React.useLayoutEffect(() => {
          for (const key of [
            "enabled",
            "enableDamping",
            "minPolarAngle",
            "maxPolarAngle",
            "autoRotateSpeed",
            "dampingFactor",
          ] as const) {
            if (props[key] !== undefined)
              Object.assign(controls, { [key]: props[key] });
          }
          host.controls = controls;
        });
        useFrame(() => {
          if (controls.enabled) controls.update();
        }, -1);
        React.useEffect(() => () => controls.dispose(), [controls]);
        return null;
      },
    ),
  };
});

const driver: CameraView = {
  position: [0.401, 1.123, -0.278],
  target: [0.318083, 0.839214, 0.677296],
  fov: 63.4943,
  minDistance: 0.05,
  maxDistance: 2,
};
const cameraViews = { interior: driver };

function frame(delta = 1 / 60) {
  act(() => {
    for (const entry of [...host.frames.values()].sort(
      (a, b) => a.priority - b.priority,
    ))
      entry.callback(host.state, delta);
  });
}
function key(value: string, times = 1) {
  for (let n = 0; n < times; n++)
    host.state.gl.domElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, cancelable: true }),
    );
}

beforeEach(() => {
  host.state = {
    camera: new PerspectiveCamera(38, 1.6, 0.02, 100),
    size: { width: 1440, height: 900 },
    gl: { domElement: document.createElement("canvas") },
    invalidate: vi.fn(),
  };
  host.state.camera.position.set(4, 2, 6);
});
afterEach(() => {
  cleanup();
  host.frames.clear();
  host.controls = null;
});

describe("camera motion and fixed-seat controls", () => {
  it.each([
    [1440, 744],
    [390, 602],
  ])(
    "actually changes camera azimuth after Rotate at %s×%s",
    (width, height) => {
      let frameRequested = false;
      host.state.invalidate = () => {
        frameRequested = true;
      };
      const demandFrame = () => {
        expect(frameRequested).toBe(true);
        frameRequested = false;
        frame();
      };
      host.state.size = { width, height };
      host.state.camera.position.set(...CAMERA_VIEWS.hero.position);
      const result = render(
        <CameraRig
          preset="hero"
          autoRotate={false}
          reducedMotion={false}
          onManual={() => {}}
        />,
      );
      demandFrame();
      demandFrame();
      result.rerender(
        <CameraRig
          preset="hero"
          autoRotate
          reducedMotion={false}
          onManual={() => {}}
        />,
      );
      for (let n = 0; n < 120; n++) demandFrame();
      expect(host.controls!.autoRotate).toBe(true);
      const azimuth = host.controls!.getAzimuthalAngle();
      for (let n = 0; n < 60; n++) demandFrame();
      expect(
        Math.abs(host.controls!.getAzimuthalAngle() - azimuth),
      ).toBeGreaterThan(0.02);
    },
  );
  it.each(Object.entries(CAMERA_VIEWS).filter(([name]) => name !== "interior"))(
    "starts %s from the actual manually turned and raised cabin view",
    (preset, view) => {
      const onManual = vi.fn();
      const result = render(
        <CameraRig
          preset="interior"
          autoRotate={false}
          reducedMotion
          onManual={onManual}
          cameraViews={cameraViews}
        />,
      );
      frame();
      const camera = host.state.camera;
      expect(
        camera.position.distanceTo(new Vector3(...driver.position)),
      ).toBeLessThan(1e-8);
      key("ArrowRight", 15);
      key("ArrowUp", 30);
      const beforeDirection = camera.getWorldDirection(new Vector3());
      const beforePosition = camera.position.clone();
      expect(beforeDirection.y).toBeGreaterThan(0.5);
      result.rerender(
        <CameraRig
          preset={preset}
          autoRotate={false}
          reducedMotion={false}
          onManual={onManual}
          cameraViews={cameraViews}
        />,
      );
      frame(0.001);
      const afterDirection = camera.getWorldDirection(new Vector3());
      expect(beforeDirection.angleTo(afterDirection)).toBeLessThan(0.05);
      expect(camera.position.distanceTo(beforePosition)).toBeLessThan(0.1);
      for (let n = 0; n < 240; n++) {
        const previousOrientation = camera.quaternion.clone();
        frame();
        expect(previousOrientation.angleTo(camera.quaternion)).toBeLessThan(
          0.4,
        );
      }
      expect(
        camera.position.distanceTo(new Vector3(...view.position)),
      ).toBeLessThan(0.00001);
      expect(
        host.controls!.target.distanceTo(new Vector3(...view.target)),
      ).toBeLessThan(0.00001);
      expect(host.controls!.minPolarAngle).toBe(0.005);
      expect(host.controls!.maxPolarAngle).toBe(Math.PI / 2 - 0.025);
    },
  );

  it("returns immediately with reduced motion and accepts keyboard cancellation during a smooth return", () => {
    const onManual = vi.fn();
    const result = render(
      <CameraRig
        preset="interior"
        autoRotate={false}
        reducedMotion
        onManual={onManual}
        cameraViews={cameraViews}
      />,
    );
    frame();
    key("ArrowRight", 20);
    result.rerender(
      <CameraRig
        preset="hero"
        autoRotate={false}
        reducedMotion
        onManual={onManual}
        cameraViews={cameraViews}
      />,
    );
    frame();
    expect(
      host.state.camera.position.distanceTo(
        new Vector3(...CAMERA_VIEWS.hero.position),
      ),
    ).toBeLessThan(1e-8);
    result.rerender(
      <CameraRig
        preset="interior"
        autoRotate={false}
        reducedMotion
        onManual={onManual}
        cameraViews={cameraViews}
      />,
    );
    frame();
    key("ArrowRight", 20);
    result.rerender(
      <CameraRig
        preset="hero"
        autoRotate
        reducedMotion={false}
        onManual={onManual}
        cameraViews={cameraViews}
      />,
    );
    for (let n = 0; n < 6; n++) frame();
    key("ArrowLeft");
    const manualPosition = host.state.camera.position.clone();
    for (let n = 0; n < 30; n++) frame();
    expect(host.state.camera.position.distanceTo(manualPosition)).toBeLessThan(
      1e-8,
    );
    expect(host.controls!.autoRotate).toBe(false);
  });

  it("keeps the eye point fixed while look and wheel input reach their limits", () => {
    const onManual = vi.fn();
    render(
      <CameraRig
        preset="interior"
        autoRotate={false}
        reducedMotion
        onManual={onManual}
        cameraViews={cameraViews}
      />,
    );
    frame();
    const camera = host.state.camera;
    key("ArrowRight", 100);
    key("ArrowDown", 100);
    expect(camera.getWorldDirection(new Vector3()).y).toBeCloseTo(
      Math.sin(-0.65),
    );
    const wheel = (deltaY: number) =>
      host.state.gl.domElement.dispatchEvent(
        new WheelEvent("wheel", { deltaY, cancelable: true }),
      );
    wheel(-10000);
    expect(camera.fov).toBe(45);
    wheel(10000);
    expect(camera.fov).toBe(85);
    for (let n = 0; n < 30; n++) frame();
    expect(
      camera.position.distanceTo(new Vector3(...driver.position)),
    ).toBeLessThan(1e-8);
    expect(camera.getWorldDirection(new Vector3()).y).toBeCloseTo(
      Math.sin(-0.65),
    );
    expect(onManual).toHaveBeenCalled();
  });
});
