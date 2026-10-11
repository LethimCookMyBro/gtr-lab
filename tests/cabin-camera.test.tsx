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

let now = 0;
let rigPosition: number[] = [];
function frame(delta = 1 / 60, elapsed = delta) {
  now += elapsed * 1000;
  act(() => {
    for (const entry of [...host.frames.values()].sort(
      (a, b) => a.priority - b.priority,
    )) {
      entry.callback(host.state, delta);
      if (entry.priority === -2)
        rigPosition = host.state.camera.position.toArray();
    }
  });
}
function key(value: string, times = 1) {
  for (let n = 0; n < times; n++)
    host.state.gl.domElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, cancelable: true }),
    );
}

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
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
  vi.restoreAllMocks();
});

describe("camera motion and fixed-seat controls", () => {
  it("reapplies the same exterior preset after a manual orbit", () => {
    const result = render(
      <CameraRig
        preset="hero"
        requestId={0}
        autoRotate={false}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    const canonical = host.state.camera.position.clone();
    key("ArrowLeft", 5);
    expect(host.state.camera.position.distanceTo(canonical)).toBeGreaterThan(
      0.1,
    );
    result.rerender(
      <CameraRig
        preset="hero"
        requestId={1}
        autoRotate={false}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    expect(host.state.camera.position.distanceTo(canonical)).toBeLessThan(
      0.00001,
    );
  });
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

describe("bounded preview camera", () => {
  const preview = { ...driver, near: 0.015, far: 50 };
  it("restores the exact manually orbited exterior pose and lens after a preview", () => {
    const result = render(
      <CameraRig
        preset="hero"
        autoRotate={false}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    key("ArrowLeft", 8);
    const position = host.state.camera.position.clone();
    const quaternion = host.state.camera.quaternion.clone();
    const fov = host.state.camera.fov;
    result.rerender(
      <CameraRig
        preset="hero"
        cabinView={preview}
        autoRotate={false}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    expect(
      host.state.camera.position.distanceTo(new Vector3(...driver.position)),
    ).toBeLessThan(1e-8);
    expect(host.state.camera.near).toBe(0.015);
    key("ArrowRight", 20);
    result.rerender(
      <CameraRig
        preset="hero"
        autoRotate={false}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    expect(host.state.camera.position.distanceTo(position)).toBeLessThan(1e-8);
    expect(host.state.camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-7);
    expect(host.state.camera.fov).toBe(fov);
    expect(host.state.camera.near).toBe(0.02);
  });
  it("changes fixed seats without enabling orbital translation and keeps demand frames bounded", () => {
    const result = render(
      <CameraRig
        preset="hero"
        cabinView={preview}
        autoRotate={true}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    const passenger = {
      ...preview,
      position: [-0.42, 1.18, -0.235] as [number, number, number],
    };
    result.rerender(
      <CameraRig
        preset="hero"
        cabinView={passenger}
        autoRotate={true}
        reducedMotion
        onManual={() => {}}
      />,
    );
    frame();
    key("ArrowLeft", 120);
    expect(host.controls!.enabled).toBe(false);
    expect(host.controls!.autoRotate).toBe(false);
    expect(
      host.state.camera.position.distanceTo(new Vector3(...passenger.position)),
    ).toBeLessThan(1e-8);
  });
});

it("keeps the eye fixed on every non-reduced entry frame after exterior rotation and damping", () => {
  const props = {
    preset: "hero",
    autoRotate: true,
    reducedMotion: false,
    onManual: () => {},
  };
  const result = render(<CameraRig {...props} />);
  for (let i = 0; i < 240; i++) frame();
  expect(host.controls!.autoRotate).toBe(true);
  expect(host.controls!.enableDamping).toBe(true);
  const preview = { ...driver, near: 0.015, far: 50 };
  result.rerender(
    <CameraRig {...props} autoRotate={false} cabinView={preview} />,
  );
  for (let i = 0; i < 120; i++) {
    frame();
    expect(
      host.state.camera.position.distanceTo(new Vector3(...preview.position)),
    ).toBeLessThan(1e-8);
  }
});

it("starts a seat change from the actual manually turned cabin orientation", () => {
  const preview = { ...driver, near: 0.015, far: 50 };
  const result = render(
    <CameraRig
      preset="hero"
      cabinView={preview}
      autoRotate={false}
      reducedMotion
      onManual={() => {}}
    />,
  );
  frame();
  key("ArrowRight", 12);
  key("ArrowUp", 8);
  const rotation = host.state.camera.quaternion.clone();
  const passenger = {
    ...preview,
    position: [-0.42, 1.18, -0.235] as [number, number, number],
  };
  result.rerender(
    <CameraRig
      preset="hero"
      cabinView={passenger}
      autoRotate={false}
      reducedMotion={false}
      onManual={() => {}}
    />,
  );
  expect(host.state.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
  frame(0.001);
  expect(host.state.camera.quaternion.angleTo(rotation)).toBeLessThan(0.05);
});

describe("target-relative wall-clock transitions", () => {
  const props = {
    preset: "hero",
    autoRotate: false,
    reducedMotion: false,
    onManual() {},
  };

  it("excludes idle time before a new target while preserving the 60 Hz curve", () => {
    const result = render(<CameraRig {...props} reducedMotion />);
    frame();
    now += 60_000;
    const start = host.state.camera.position.clone();
    result.rerender(<CameraRig {...props} preset="side" />);
    frame(60, 1 / 60);
    const expected = start.lerp(
      new Vector3(...CAMERA_VIEWS.side.position),
      1 - Math.exp(-7 / 60),
    );
    expect(host.state.camera.position.distanceTo(expected)).toBeLessThan(1e-10);
  });

  it("settles position, target and FOV exactly after a sparse 3.5 second sample", () => {
    const result = render(<CameraRig {...props} reducedMotion />);
    frame();
    result.rerender(<CameraRig {...props} preset="side" />);
    frame(1 / 60);
    frame(0.1, 3.5);
    expect(rigPosition).toEqual(CAMERA_VIEWS.side.position);
    expect(host.controls!.target.toArray()).toEqual(CAMERA_VIEWS.side.target);
    expect(host.state.camera.fov).toBe(CAMERA_VIEWS.side.fov);
  });

  it("retargets from the last applied pose without inheriting a pending target's age", () => {
    const result = render(<CameraRig {...props} reducedMotion />);
    frame();
    result.rerender(<CameraRig {...props} preset="side" />);
    frame(0.05);
    now += 3500;
    const start = host.state.camera.position.clone();
    result.rerender(<CameraRig {...props} preset="rear" />);
    frame(3.5, 1 / 60);
    const expected = start.lerp(
      new Vector3(...CAMERA_VIEWS.rear.position),
      1 - Math.exp(-7 / 60),
    );
    expect(host.state.camera.position.distanceTo(expected)).toBeLessThan(1e-10);
    frame(0.1, 3.5);
    expect(rigPosition).toEqual(CAMERA_VIEWS.rear.position);
  });

  it("settles cabin entry and exit on sparse frames while retaining the fixed eye and exact saved exterior", () => {
    const preview = { ...driver, near: 0.015, far: 50 };
    const result = render(<CameraRig {...props} reducedMotion />);
    frame();
    key("ArrowLeft", 8);
    const position = host.state.camera.position.clone();
    const target = host.controls!.target.clone();
    const fov = host.state.camera.fov;
    now += 60_000;
    result.rerender(<CameraRig {...props} cabinView={preview} />);
    frame(60, 1 / 60);
    expect(
      host.state.camera.position.distanceTo(new Vector3(...preview.position)),
    ).toBeLessThan(1e-10);
    frame(0.1, 3.5);
    expect(host.controls!.target.toArray()).toEqual(preview.target);
    expect(host.state.camera.fov).toBe(preview.fov);
    result.rerender(<CameraRig {...props} />);
    frame(0.1, 3.5);
    expect(host.state.camera.position.distanceTo(position)).toBeLessThan(1e-10);
    expect(host.controls!.target.distanceTo(target)).toBeLessThan(1e-10);
    expect(host.state.camera.fov).toBe(fov);
  });

  it("cancels sparse transitions on manual input and starts Home from its own request time", () => {
    const result = render(<CameraRig {...props} reducedMotion />);
    frame();
    result.rerender(<CameraRig {...props} preset="side" />);
    frame(0.05);
    key("ArrowLeft");
    const cancelled = host.state.camera.position.clone();
    frame(0.1, 3.5);
    expect(host.state.camera.position.distanceTo(cancelled)).toBeLessThan(
      1e-10,
    );
    now += 60_000;
    key("Home");
    const start = host.state.camera.position.clone();
    frame(60, 1 / 60);
    const expected = start.lerp(
      new Vector3(...CAMERA_VIEWS.side.position),
      1 - Math.exp(-7 / 60),
    );
    expect(host.state.camera.position.distanceTo(expected)).toBeLessThan(1e-10);
    frame(0.1, 3.5);
    expect(rigPosition).toEqual(CAMERA_VIEWS.side.position);
  });

  it("gives a remounted rig a fresh transition epoch and leaves no old frame callbacks", () => {
    const first = render(<CameraRig {...props} />);
    frame(0.05);
    first.unmount();
    expect(host.frames.size).toBe(0);
    now += 60_000;
    const start = host.state.camera.position.clone();
    render(<CameraRig {...props} preset="side" />);
    frame(60, 1 / 60);
    const expected = start.lerp(
      new Vector3(...CAMERA_VIEWS.side.position),
      1 - Math.exp(-7 / 60),
    );
    expect(host.state.camera.position.distanceTo(expected)).toBeLessThan(1e-10);
  });
});
