// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { CameraRig } from "../src/components/three/CameraRig";
import { CAMERA_VIEWS } from "../src/components/three/sceneHelpers";

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

function frame() {
  act(() => {
    for (const entry of [...host.frames.values()].sort(
      (a, b) => a.priority - b.priority,
    ))
      entry.callback(host.state, 1 / 60);
  });
}

beforeEach(() => {
  host.state = {
    camera: new PerspectiveCamera(34, 390 / 392, 0.02, 150),
    size: { width: 390, height: 392 },
    gl: { domElement: document.createElement("canvas") },
    invalidate: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  host.frames.clear();
  host.controls = null;
});

function rig(preset = "hero") {
  return (
    <CameraRig
      preset={preset}
      autoRotate={false}
      reducedMotion
      onManual={() => {}}
    />
  );
}

it.each(["hero", "front", "side", "rear-quarter", "rear", "top"])(
  "uses the bounded narrow-screen distance for the real %s camera rig",
  (preset) => {
    render(rig(preset));
    frame();
    const view = CAMERA_VIEWS[preset];
    const target = new Vector3(...view.target);
    const baseDistance = new Vector3(...view.position).distanceTo(target);
    expect(host.state.camera.position.distanceTo(target)).toBeCloseTo(
      Math.min(11, baseDistance * 1.22),
    );
    expect(host.state.camera.fov).toBeCloseTo((view.fov * 392) / 390);
    expect(host.controls!.maxDistance).toBe(11);
  },
);

it("recomputes the distance when crossing the mobile breakpoint without an aspect change", () => {
  host.state.size = { width: 761, height: 761 };
  const result = render(rig());
  frame();
  const view = CAMERA_VIEWS.hero;
  const target = new Vector3(...view.target);
  const baseDistance = new Vector3(...view.position).distanceTo(target);
  expect(host.state.camera.position.distanceTo(target)).toBeCloseTo(
    baseDistance,
  );
  host.state.size = { width: 760, height: 760 };
  result.rerender(rig());
  frame();
  expect(host.state.camera.position.distanceTo(target)).toBeCloseTo(
    baseDistance * 1.22,
  );
  host.state.size = { width: 1440, height: 744 };
  result.rerender(rig());
  frame();
  expect(
    host.state.camera.position.distanceTo(new Vector3(...view.position)),
  ).toBeLessThan(1e-8);
  expect(host.state.camera.fov).toBe(view.fov);
});

it.each(["wheel", "interior"])(
  "retains the mobile %s detail preset exactly",
  (preset) => {
    render(rig(preset));
    frame();
    const view = CAMERA_VIEWS[preset];
    expect(
      host.state.camera.position.distanceTo(new Vector3(...view.position)),
    ).toBeLessThan(1e-8);
    expect(host.state.camera.fov).toBe(view.fov);
  },
);
