// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Color, Scene, SRGBColorSpace } from "three";
// Three's internal background pass is used to exercise real offscreen clear semantics.
// @ts-expect-error Three does not publish types for internal renderer modules.
import { WebGLBackground } from "three/src/renderers/webgl/WebGLBackground.js";
import VehicleScene from "../src/components/three/VehicleScene";

const host = vi.hoisted(() => ({
  onCreated: null as ((state: { gl: unknown }) => void) | null,
  alpha: true,
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: (props: {
    gl: { alpha: boolean };
    onCreated: typeof host.onCreated;
  }) => {
    host.alpha = props.gl.alpha;
    host.onCreated = props.onCreated;
    return null;
  },
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));
vi.mock("../src/components/three/useVehicleAsset", () => ({
  useVehicleAsset: () => null,
}));
afterEach(() => {
  cleanup();
});

it("clears background-free contact passes transparently while keeping the displayed scene opaque", () => {
  let clearAlpha = 1;
  const renderer = {
    domElement: document.createElement("canvas"),
    outputColorSpace: SRGBColorSpace,
    shadowMap: { type: 0 },
    getRenderTarget: () => null,
    xr: { getEnvironmentBlendMode: () => undefined },
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    clear: () => {},
    setClearAlpha: (_alpha: number) => {},
  };
  const background = WebGLBackground(
    renderer,
    {},
    {},
    {
      buffers: {
        color: {
          setClear: (_r: number, _g: number, _b: number, alpha: number) => {
            clearAlpha = alpha;
          },
          setMask: () => {},
        },
        depth: { setTest: () => {}, setMask: () => {} },
      },
    },
    {},
    false,
    true,
  );
  renderer.setClearAlpha = background.setClearAlpha;
  render(
    <VehicleScene
      url="/test.glb"
      paint="#aaaaaa"
      environment="studio"
      preset="hero"
      autoRotate={false}
      lights={false}
      reducedMotion
      materialRoles={{ paint: [], headlights: [], taillights: [] }}
      onReady={() => {}}
      onError={() => {}}
      onProgress={() => {}}
      onManual={() => {}}
    />,
  );
  expect(host.alpha).toBe(false);
  host.onCreated!({ gl: renderer });
  const scene = new Scene();
  background.render(scene);
  expect(clearAlpha).toBe(0);
  scene.background = new Color("#111316");
  background.render(scene);
  expect(clearAlpha).toBe(1);
  scene.background = null;
  background.render(scene);
  expect(clearAlpha).toBe(0);
});
