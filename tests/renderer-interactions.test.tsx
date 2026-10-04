// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  render,
  renderHook,
  waitFor,
  screen,
} from "@testing-library/react";
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three-stdlib";
import {
  connectExteriorKeyboard,
  setViewerAccessibility,
} from "../src/components/three/keyboardControls";
import { EnvironmentBoundary } from "../src/components/three/EnvironmentBoundary";
import { useVehicleAsset } from "../src/components/three/useVehicleAsset";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("keyboard-accessible exterior", () => {
  it("provides a focus stop and operating instructions", () => {
    const canvas = document.createElement("canvas");
    setViewerAccessibility(canvas, false);
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute("aria-label")).toMatch(
      /arrow keys.*plus.*minus.*Home/i,
    );
    expect(canvas.getAttribute("role")).toBe("application");
  });
  it("orbits and zooms with real controls, cancels automation, supports reset and detaches", () => {
    const canvas = document.createElement("canvas");
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 7);
    const controls = new OrbitControls(camera);
    controls.target.set(0, 0.7, 0);
    controls.minDistance = 3;
    controls.maxDistance = 10;
    controls.minPolarAngle = 0.005;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    let manual = 0;
    let reset = 0;
    let invalidated = 0;
    const disconnect = connectExteriorKeyboard({
      canvas,
      camera,
      controls,
      onManual: () => manual++,
      onReset: () => reset++,
      invalidate: () => invalidated++,
    });
    const fire = (key: string, ctrlKey = false) => {
      const event = new KeyboardEvent("keydown", {
        key,
        ctrlKey,
        cancelable: true,
      });
      canvas.dispatchEvent(event);
      return event;
    };
    const initial = camera.position.clone();
    const distance = initial.distanceTo(controls.target);
    expect(fire("ArrowLeft").defaultPrevented).toBe(true);
    expect(camera.position.equals(initial)).toBe(false);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance);
    fire("+");
    expect(camera.position.distanceTo(controls.target)).toBeLessThan(distance);
    for (let n = 0; n < 40; n++) fire("+");
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(3);
    for (let n = 0; n < 40; n++) fire("-");
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(10);
    fire("Home");
    expect(reset).toBe(1);
    const manualBefore = manual;
    expect(fire("+", true).defaultPrevented).toBe(false);
    expect(manual).toBe(manualBefore);
    expect(invalidated).toBeGreaterThan(0);
    disconnect();
    fire("ArrowLeft");
    expect(manual).toBe(manualBefore);
    controls.dispose();
  });
});

describe("recoverable environment error", () => {
  it("retains independent scene content and resets for the next selection", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const messages: string[] = [];
    function FailedEnvironment(): never {
      throw new Error("HDRI request failed");
    }
    const result = render(
      <>
        <span>Vehicle remains interactive</span>
        <EnvironmentBoundary
          key="forest"
          onFailure={(message) => messages.push(message)}
          fallback={<span>Studio fallback</span>}
        >
          <FailedEnvironment />
        </EnvironmentBoundary>
      </>,
    );
    expect(screen.getByText("Vehicle remains interactive")).toBeTruthy();
    expect(screen.getByText("Studio fallback")).toBeTruthy();
    expect(messages).toEqual(["HDRI request failed"]);
    result.rerender(
      <>
        <span>Vehicle remains interactive</span>
        <EnvironmentBoundary
          key="coast"
          onFailure={() => {}}
          fallback={<span>Studio fallback</span>}
        >
          <span>Coast loaded</span>
        </EnvironmentBoundary>
      </>,
    );
    expect(screen.getByText("Coast loaded")).toBeTruthy();
    expect(screen.queryByText("Studio fallback")).toBeNull();
  });
});

function fixtureGlb() {
  const vertices = new Float32Array([-1, 0, -2, 1, 1, -2, 0, 0, 2]);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-1, 0, -2],
        max: [1, 1, 2],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertices.byteLength },
    ],
    buffers: [{ byteLength: vertices.byteLength }],
  });
  const padded = new TextEncoder().encode(
    json.padEnd(Math.ceil(json.length / 4) * 4),
  );
  const buffer = new ArrayBuffer(
    12 + 8 + padded.byteLength + 8 + vertices.byteLength,
  );
  const header = new DataView(buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, buffer.byteLength, true);
  header.setUint32(12, padded.byteLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, padded.byteLength).set(padded);
  const bin = 20 + padded.byteLength;
  header.setUint32(bin, vertices.byteLength, true);
  header.setUint32(bin + 4, 0x004e4942, true);
  new Float32Array(buffer, bin + 8, vertices.length).set(vertices);
  return buffer;
}

describe("actual GLB parse progress", () => {
  it("holds at 99 after decoding, leaving 100 for a rendered ready frame", async () => {
    const fixture = fixtureGlb();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(fixture, {
            headers: { "content-length": String(fixture.byteLength) },
          }),
      ),
    );
    const progress: number[] = [];
    const errors: string[] = [];
    const { result } = renderHook(() =>
      useVehicleAsset(
        "/fixture.glb",
        { paint: [], headlights: [], taillights: [] },
        (value) => progress.push(value),
        (message) => errors.push(message),
      ),
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(errors).toEqual([]);
    expect(progress.at(-1)).toBe(99);
    expect(progress.every((value) => value < 100)).toBe(true);
  });
});

describe("rendered scene readiness", () => {
  it("reports ready only after both the model and selected environment rendered", async () => {
    const { useSceneReadiness } =
      await import("../src/components/three/useSceneReadiness");
    let reports = 0;
    const { result, rerender } = renderHook(
      ({ environment }) =>
        useSceneReadiness("/car.glb", environment, () => reports++),
      { initialProps: { environment: "forest" } },
    );
    const forestReady = result.current.onEnvironmentRendered;
    result.current.onVehicleRendered();
    expect(reports).toBe(0);
    rerender({ environment: "coast" });
    forestReady();
    expect(reports).toBe(0);
    result.current.onEnvironmentRendered();
    expect(reports).toBe(1);
    result.current.onVehicleRendered();
    result.current.onEnvironmentRendered();
    expect(reports).toBe(1);
  });
});

it("reopens the render-ready barrier for each environment attempt without reloading the vehicle", async () => {
  const { useSceneReadiness } =
    await import("../src/components/three/useSceneReadiness");
  let reports = 0;
  const { result, rerender } = renderHook(
    ({ attempt }) => useSceneReadiness("/car.glb", attempt, () => reports++),
    { initialProps: { attempt: "studio:0" } },
  );
  result.current.onVehicleRendered();
  result.current.onEnvironmentRendered();
  expect(reports).toBe(1);
  const stale = result.current.onEnvironmentRendered;
  rerender({ attempt: "coast:1" });
  stale();
  expect(reports).toBe(1);
  result.current.onEnvironmentRendered();
  expect(reports).toBe(2);
});

describe("canvas fallback mounting", () => {
  it("does not report a graphics failure merely because fallback content mounted", async () => {
    const { CanvasFallback, SceneBoundary } =
      await import("../src/components/three/SceneBoundary");
    let failures = 0;
    render(
      <SceneBoundary onError={() => failures++}>
        <canvas>
          <CanvasFallback />
        </canvas>
      </SceneBoundary>,
    );
    expect(failures).toBe(0);
  });
});
