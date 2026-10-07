// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { act, advance, createRoot, extend, _roots } from "@react-three/fiber";
import { RecoverableEnvironment } from "../src/components/three/RecoverableEnvironment";
import type { WebGLRenderer, WebGLRenderTarget, Scene, Vector2 } from "three";

// Node loads R3F's CJS renderer; give its catalogue the same Three constructors.
// The scene, environment capture and contact-shadow components are real. Only
// texture IO and the WebGL device are substituted; no browser or server runs.
const THREE: typeof import("three") = createRequire(import.meta.url)("three");
extend({
  Group: THREE.Group,
  Mesh: THREE.Mesh,
  Color: THREE.Color,
  Fog: THREE.Fog,
  AmbientLight: THREE.AmbientLight,
  HemisphereLight: THREE.HemisphereLight,
  DirectionalLight: THREE.DirectionalLight,
  RectAreaLight: THREE.RectAreaLight,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  PlaneGeometry: THREE.PlaneGeometry,
  RingGeometry: THREE.RingGeometry,
  CircleGeometry: THREE.CircleGeometry,
  OrthographicCamera: THREE.OrthographicCamera,
  CubeCamera: THREE.CubeCamera,
});
const inputs = vi.hoisted(() => ({
  textures: [] as import("three").Texture[],
}));
vi.mock("@react-three/drei/core/Texture", () => ({
  useTexture: () => inputs.textures,
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots.length = 0;
  inputs.textures.forEach((texture) => texture.dispose());
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  inputs.textures = Array.from(
    { length: 13 },
    () => new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1),
  );
  const canvas = document.createElement("canvas");
  const draws: { reflection: boolean; shadow: boolean }[] = [];
  let target: WebGLRenderTarget | null = null;
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    autoClear: true,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    setPixelRatio() {},
    getPixelRatio: () => 1,
    setSize() {},
    getSize: (size: Vector2) => size.set(390, 392),
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
    },
    render(scene: Scene) {
      draws.push({
        reflection:
          target !== null &&
          "isWebGLCubeRenderTarget" in target &&
          target.isWebGLCubeRenderTarget === true,
        shadow: Boolean(scene.overrideMaterial),
      });
    },
    renderLists: { dispose() {} },
    forceContextLoss() {},
  };
  const root = createRoot(canvas);
  roots.push(root);
  // A deliberately non-drawing device implements only methods these real
  // rendering paths use. Three/R3F still execute their full capture lifecycles.
  await root.configure({
    gl: renderer as unknown as WebGLRenderer,
    frameloop: "never",
    size: { width: 390, height: 392, top: 0, left: 0 },
    camera: { position: [5, 3, 5] },
  });
  const store = _roots.get(canvas)!.store;
  const frame = () => act(async () => advance(1, false, store.getState()));
  const counts = () => ({
    reflection: draws.filter((draw) => draw.reflection).length,
    shadow: draws.filter((draw) => draw.shadow).length,
  });
  return { root, store, frame, counts };
}

it("does not recapture lighting or restart contact shadows for unchanged environment inputs", async () => {
  const { root, frame, counts } = await setup();
  const ready = vi.fn();
  const fallback = vi.fn();
  const renderLighting = () =>
    act(async () =>
      root.render(
        <RecoverableEnvironment
          environment="studio"
          reducedMotion
          onReady={ready}
          onFallback={fallback}
        />,
      ),
    );
  await renderLighting();
  await frame();
  await frame();
  expect(counts()).toEqual({ reflection: 6, shadow: 1 });
  expect(ready).toHaveBeenCalledTimes(1);
  // Panel, paint, camera, download progress and cabin seat updates all pass
  // these same environment inputs while their own scene components update.
  for (let update = 0; update < 5; update++) {
    await renderLighting();
    await frame();
    expect(counts()).toEqual({ reflection: 6, shadow: 1 });
  }
  expect(fallback).not.toHaveBeenCalled();
});

it("recaptures genuine environment changes, retry keys, reduced motion and viewport changes", async () => {
  const { root, store, frame, counts } = await setup();
  const ready = vi.fn();
  const renderLighting = (
    environment: "studio" | "gallery",
    request: number,
    reduced = true,
  ) =>
    act(async () =>
      root.render(
        <RecoverableEnvironment
          key={`${environment}-${request}`}
          environment={environment}
          reducedMotion={reduced}
          onReady={ready}
        />,
      ),
    );
  await renderLighting("studio", 0);
  await frame();
  expect(counts()).toEqual({ reflection: 6, shadow: 1 });
  await renderLighting("gallery", 1);
  await frame();
  expect(counts()).toEqual({ reflection: 12, shadow: 2 });
  await renderLighting("gallery", 2);
  await frame();
  expect(counts()).toEqual({ reflection: 18, shadow: 3 });
  await renderLighting("gallery", 2, false);
  await frame();
  expect(counts()).toEqual({ reflection: 24, shadow: 4 });
  await act(async () => store.getState().setSize(1440, 900));
  await frame();
  expect(counts()).toEqual({ reflection: 30, shadow: 5 });
});
