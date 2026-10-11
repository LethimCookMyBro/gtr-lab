// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { PerspectiveCamera, TOUCH } from "three";
import { OrbitControls } from "three-stdlib";
import { useReleasedOrbitDamping } from "../src/components/three/useReleasedOrbitDamping";
const host = vi.hoisted(() => ({
  state: null as unknown as {
    camera: PerspectiveCamera;
    gl: { domElement: HTMLCanvasElement };
  },
  frames: new Map<object, { priority: number; callback: () => void }>(),
}));
vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return {
    useThree: (selector: (state: typeof host.state) => unknown) =>
      selector(host.state),
    useFrame: (callback: () => void, priority = 0) => {
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
let time: number, controls: OrbitControls, canvas: HTMLCanvasElement;
let ref: { current: OrbitControls | null }, moving: { current: boolean };
let factors: number[], original: OrbitControls["update"];
const dreiKey = {};
const FIVE_SECOND_FACTOR = -Math.expm1(60 * 5 * Math.log1p(-0.09));
type Props = {
  exterior?: boolean;
  reducedMotion?: boolean;
  autoRotate?: boolean;
  preset?: string;
  requestId?: number;
};
function Harness(props: Props) {
  useReleasedOrbitDamping({
    controls: ref,
    moving,
    exterior: true,
    reducedMotion: false,
    autoRotate: false,
    preset: "hero",
    requestId: 0,
    ...props,
  });
  return null;
}
function pointer(
  target: EventTarget,
  type: string,
  options: Partial<PointerEvent> = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    shiftKey: options.shiftKey,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
  });
  target.dispatchEvent(event);
}
function drag(options: Partial<PointerEvent> = {}) {
  pointer(canvas, "pointerdown", options);
  pointer(document, "pointermove", { ...options, clientX: 80, clientY: 10 });
}
function release(options: Partial<PointerEvent> = {}) {
  pointer(document, "pointerup", options);
}
function frame(at: number) {
  time = at;
  act(() => {
    for (const item of [...host.frames.values()].sort(
      (a, b) => a.priority - b.priority,
    ))
      item.callback();
  });
}
beforeEach(() => {
  time = 0;
  factors = [];
  moving = { current: false };
  vi.spyOn(performance, "now").mockImplementation(() => time * 1000);
  canvas = document.createElement("canvas");
  document.body.append(canvas);
  Object.defineProperties(canvas, {
    clientWidth: { value: 1000 },
    clientHeight: { value: 1000 },
  });
  canvas.releasePointerCapture = (id) =>
    pointer(canvas, "lostpointercapture", { pointerId: id });
  const camera = new PerspectiveCamera(45, 1, 0.02, 1000);
  camera.position.set(0, 4, 10);
  controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true,
    dampingFactor: 0.09,
    enablePan: false,
    rotateSpeed: 0.6,
    autoRotateSpeed: 0.45,
    minPolarAngle: 0.005,
    maxPolarAngle: Math.PI / 2 - 0.025,
  });
  original = controls.update;
  controls.update = vi.fn(() => {
    factors.push(controls.dampingFactor);
    return original();
  });
  ref = { current: controls };
  host.state = { camera, gl: { domElement: canvas } };
  host.frames.set(dreiKey, {
    priority: -1,
    callback: () => {
      if (controls.enabled) controls.update();
    },
  });
});
afterEach(() => {
  cleanup();
  controls.dispose();
  canvas.remove();
  host.frames.clear();
  vi.restoreAllMocks();
});

describe("released exterior damping React/DOM ownership", () => {
  it("guards the installed Drei frame owner and CameraRig integration order", () => {
    const drei = readFileSync(
      "node_modules/@react-three/drei/core/OrbitControls.js",
      "utf8",
    );
    expect(drei.match(/controls\.update\(\)/g)).toHaveLength(1);
    expect(drei).toMatch(
      /useFrame\(\(\) => \{\s*if \(controls\.enabled\) controls\.update\(\);\s*\}, -1\)/,
    );
    const rig = readFileSync("src/components/three/CameraRig.tsx", "utf8");
    expect(rig).toContain("useReleasedOrbitDamping({");
    expect(rig).toContain("}, -2);");
    const terminalInterior = `        // The earlier update used the interpolated target. Disabled interior
        // controls skip Drei's later update, so finish their exact look now.
        if (preset === "interior") {
          orbit.update();
          // Native spherical normalization must not translate the fixed eye.
          camera.position.copy(destination.position);
        }
`;
    expect(rig.split(terminalInterior)).toHaveLength(2);
    const terminal = rig.slice(
      rig.indexOf("camera.position.distanceToSquared(destination.position)"),
      rig.indexOf("orbit.enableDamping = !reducedMotion && !moving.current;"),
    );
    expect(terminal).toContain(terminalInterior);
    expect(terminal.indexOf(terminalInterior)).toBeGreaterThan(
      terminal.indexOf("moving.current = false;"),
    );
    expect(terminal.indexOf(terminalInterior)).toBeGreaterThan(
      terminal.indexOf("orbit.target.copy(destination.target);"),
    );
    expect(terminal.indexOf(terminalInterior)).toBeGreaterThan(
      terminal.indexOf("orbit.maxPolarAngle = Math.PI / 2 - 0.025;"),
    );
    expect(rig.replace(terminalInterior, "").match(/orbit\.update\(\)/g)).toHaveLength(2); // Existing cabin drain and transition remain exact outside the reviewed interior terminal correction.
  });
  it("adds no updater and brackets the existing Drei callback", () => {
    render(<Harness />);
    expect(
      [...host.frames.values()].map((x) => x.priority).sort((a, b) => a - b),
    ).toEqual([-1.5, -1, -0.5]);
    expect(factors).toEqual([]);
    frame(10);
    expect(factors).toEqual([0.09]);
    drag();
    release();
    expect(factors).toHaveLength(2);
    frame(15);
    expect(factors).toHaveLength(3);
    expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
    expect(controls.dampingFactor).toBe(0.09);
  });
  it("normal releasePointerCapture cannot erase the just-released epoch", () => {
    render(<Harness />);
    drag();
    release();
    frame(5);
    expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
  });
  it("held drag stays native through long frames and wheel start/end", () => {
    render(<Harness />);
    drag();
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }),
    );
    frame(5);
    expect(factors.every((x) => x === 0.09)).toBe(true);
    release();
    frame(10);
    expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
  });
  it.each(["ctrlKey", "metaKey", "shiftKey"] as const)(
    "accepts native modified right-button rotation: %s",
    (modifier) => {
      render(<Harness />);
      const options = { button: 2, [modifier]: true };
      drag(options);
      release(options);
      frame(5);
      expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
    },
  );
  it("modified left-button disabled pan never creates a released epoch", () => {
    render(<Harness />);
    drag({ ctrlKey: true });
    release({ ctrlKey: true });
    frame(5);
    expect(factors.at(-1)).toBe(0.09);
  });
  it("unsupported one-touch mapping stays entirely on native damping", () => {
    controls.touches.ONE = TOUCH.PAN;
    render(<Harness />);
    drag({ pointerType: "touch" });
    release({ pointerType: "touch" });
    frame(5);
    expect(factors.at(-1)).toBe(0.09);
  });
  it("all fingers must release despite native end events", () => {
    render(<Harness />);
    drag({ pointerType: "touch" });
    pointer(canvas, "pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 100,
    });
    release({ pointerType: "touch" });
    frame(5);
    expect(factors.at(-1)).toBe(0.09);
    release({ pointerId: 2, pointerType: "touch" });
    frame(10);
    expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
  });
  it.each(["pointercancel", "lostpointercapture", "blur", "hidden"])(
    "unexpected %s cancels instead of releasing",
    (kind) => {
      render(<Harness />);
      drag();
      if (kind === "blur") window.dispatchEvent(new Event("blur"));
      else if (kind === "hidden") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        document.dispatchEvent(new Event("visibilitychange"));
      } else pointer(kind === "pointercancel" ? document : canvas, kind);
      release();
      frame(5);
      expect(factors.at(-1)).toBe(0.09);
    },
  );
  it("wheel and keyboard boundaries cancel before native work", () => {
    render(<Harness />);
    drag();
    release();
    time = 0.2;
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }),
    );
    frame(5);
    expect(factors.at(-1)).toBe(0.09);
    drag();
    release();
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    frame(10);
    expect(factors.at(-1)).toBe(0.09);
  });
  it("fresh input is never charged for preceding idle time", () => {
    render(<Harness />);
    drag();
    release();
    time = 100;
    drag();
    expect(factors.at(-1)).toBe(0.09);
    release();
    frame(100 + 1 / 120);
    expect(factors.at(-1)).toBe(0.09);
  });
  it("manual cancellation of autoRotate keeps the held pointer tracked", () => {
    controls.autoRotate = true;
    const view = render(<Harness autoRotate />);
    drag();
    controls.autoRotate = false;
    view.rerender(<Harness autoRotate={false} />);
    frame(5);
    expect(factors.at(-1)).toBe(0.09);
    release();
    frame(10);
    expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
  });
  it.each(["moving", "autoRotate", "reducedMotion", "preset", "request"])(
    "%s cancels old inertia permanently",
    (kind) => {
      const view = render(<Harness />);
      drag();
      release();
      if (kind === "moving") moving.current = true;
      if (kind === "autoRotate") {
        controls.autoRotate = true;
        view.rerender(<Harness autoRotate />);
      }
      if (kind === "reducedMotion") view.rerender(<Harness reducedMotion />);
      if (kind === "preset") view.rerender(<Harness preset="front" />);
      if (kind === "request") view.rerender(<Harness requestId={1} />);
      frame(5);
      expect(factors.at(-1)).toBe(0.09);
      moving.current = false;
      controls.autoRotate = false;
      view.rerender(<Harness />);
      frame(10);
      expect(factors.at(-1)).toBe(0.09);
    },
  );
  it("cabin skips the existing updater and discards released exterior inertia", () => {
    const view = render(<Harness />);
    drag();
    release();
    controls.enabled = false;
    view.rerender(<Harness exterior={false} preset="interior" />);
    const n = factors.length;
    frame(5);
    expect(factors).toHaveLength(n);
    controls.enabled = true;
    view.rerender(<Harness />);
    frame(10);
    expect(factors.at(-1)).toBe(0.09);
  });
  it("stale token cannot leak when Drei skips its update", () => {
    render(<Harness />);
    drag();
    release();
    const skip = {};
    host.frames.set(skip, {
      priority: -1.25,
      callback: () => {
        controls.enabled = false;
      },
    });
    frame(5);
    host.frames.delete(skip);
    controls.enabled = true;
    controls.update();
    expect(factors.at(-1)).toBe(0.09);
    expect(controls.dampingFactor).toBe(0.09);
  });
  it("frame exception restores factor without relying on the clear callback", () => {
    render(<Harness />);
    drag();
    release();
    const error = new Error("test change listener failure");
    const fail = () => {
      throw error;
    };
    controls.addEventListener("change", fail);
    expect(() => frame(5)).toThrow(error);
    expect(controls.dampingFactor).toBe(0.09);
    controls.removeEventListener("change", fail);
    controls.update();
    expect(factors.at(-1)).toBe(0.09);
  });
  it("StrictMode cleanup restores method identity and removes owned listeners", () => {
    const before = controls.update;
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    drag();
    release();
    frame(5);
    expect(factors).toHaveLength(2);
    expect(factors.at(-1)).toBe(FIVE_SECOND_FACTOR);
    view.unmount();
    expect(controls.update).toBe(before);
    expect(host.frames.size).toBe(1);
    drag();
    release();
    time = 10;
    controls.update();
    expect(factors.at(-1)).toBe(0.09);
  });
});
